import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * O que o webhook do Synse+ faz com o retorno de `set_plus_subscription`.
 *
 * Até a 0061 a função devolvia `void`, e o serviço só olhava o erro. Com três
 * origens ela devolve o que de fato aconteceu, e **duas das três
 * possibilidades não escrevem nada**:
 *
 *   APPLIED  — escreveu.
 *   STALE    — notificação mais velha que a última aplicada.
 *   CONFLICT — a assinatura viva é de outra origem.
 *
 * Marcar PROCESSED nos dois últimos registraria em `webhook_events` que a
 * assinatura mudou quando ela não mudou. Essa linha é o que alguém vai ler
 * quando a receita de um mês não fechar — e um registro que mente ali custa
 * mais do que registro nenhum.
 *
 * Testado com dublê do cliente admin porque a credencial do Supabase não
 * existe neste repositório e não pode existir. O que importa aqui é a
 * decisão do serviço, não o SQL — o SQL é
 * `tests/db/assinatura-de-tres-origens.test.ts`, contra o Postgres de verdade.
 */

const rpc = vi.fn()
const insert = vi.fn()
const marcacoes: Array<{ status: string; detalhe?: string }> = []

vi.mock('@/lib/database/env', () => ({ isDemoMode: () => false }))
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))
vi.mock('@/lib/database/supabase-admin', () => ({
  createSupabaseAdminClient: () => ({
    rpc,
    from: (tabela: string) => {
      if (tabela === 'webhook_events') {
        return {
          insert,
          // `error_detail`, que é o nome da coluna em `webhook_events` — eu
          // tinha escrito `error_message` e o dublê engolia o detalhe.
          update: (valores: { status: string; error_detail?: string | null }) => ({
            eq: () => ({
              eq: () => {
                marcacoes.push({ status: valores.status, detalhe: valores.error_detail ?? undefined })
                return Promise.resolve({ error: null })
              },
            }),
          }),
        }
      }
      throw new Error(`tabela inesperada: ${tabela}`)
    },
  }),
}))

const { processarAvisoDePlus } = await import('@/features/payments/plus-webhook-service')

/** Um provedor que só sabe responder o que a assinatura é agora. */
const provedorFalso = {
  id: 'mercadopago',
  buscarAssinatura: vi.fn(),
} as unknown as Parameters<typeof processarAvisoDePlus>[0]['provider']

const PERFIL = '33333333-3333-3333-3333-333333333333'
const MODIFICADO = '2026-10-17T12:00:00.000Z'

function avisar() {
  return processarAvisoDePlus({
    provider: provedorFalso,
    eventId: `evt-${Math.random()}`,
    eventType: 'subscription_preapproval',
    preapprovalId: 'preapproval-1',
    rawPayload: {},
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  marcacoes.length = 0
  insert.mockResolvedValue({ error: null })
  ;(provedorFalso.buscarAssinatura as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: 'preapproval-1',
    status: 'authorized',
    external_reference: PERFIL,
    next_payment_date: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    last_modified: MODIFICADO,
  })
})

describe('o desfecho que a 0061 devolve', () => {
  it('APPLIED é processado', async () => {
    rpc.mockResolvedValue({ data: 'APPLIED', error: null })
    expect(await avisar()).toBe('PROCESSED')
    expect(marcacoes).toEqual([{ status: 'PROCESSED', detalhe: undefined }])
  })

  it('STALE não é processado, e diz por quê', async () => {
    rpc.mockResolvedValue({ data: 'STALE', error: null })
    expect(await avisar()).toBe('STALE')
    expect(marcacoes).toHaveLength(1)
    expect(marcacoes[0].status).toBe('IGNORED')
    expect(marcacoes[0].detalhe).toMatch(/fora de ordem/)
  })

  it('CONFLICT não é processado, e também não é falha', async () => {
    /*
     * `FAILED` faria o Mercado Pago reenviar para sempre, e o resultado seria
     * o mesmo em cada tentativa: a assinatura viva é de outra origem. O que
     * precisa de gente está em `plus_subscription_conflicts`.
     */
    rpc.mockResolvedValue({ data: 'CONFLICT', error: null })
    expect(await avisar()).toBe('CONFLICT')
    expect(marcacoes[0].status).toBe('IGNORED')
    expect(marcacoes[0].detalhe).toMatch(/outra origem/)
  })

  it('erro de verdade continua sendo falha', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'conexão caiu' } })
    expect(await avisar()).toBe('FAILED')
    expect(marcacoes[0].status).toBe('FAILED')
  })
})

describe('o que o serviço manda para a porta única', () => {
  it('passa o horário da origem, não o nosso', async () => {
    /*
     * A regra 1 da 0061 compara horários de evento. Passar `now()` aqui
     * ordenaria a entrega em vez dos fatos, e a notificação atrasada da Apple
     * — que é o caso que a regra existe para pegar — passaria.
     */
    rpc.mockResolvedValue({ data: 'APPLIED', error: null })
    await avisar()
    expect(rpc).toHaveBeenCalledWith(
      'set_plus_subscription',
      expect.objectContaining({ p_event_at: MODIFICADO }),
    )
  })

  it('e nunca pede tomada de posse: notificação não é compra', async () => {
    /*
     * `p_takeover: true` daqui faria uma renovação velha do Mercado Pago
     * roubar a assinatura de quem comprou pela App Store. A posse só muda no
     * caminho em que a pessoa acabou de comprar.
     */
    rpc.mockResolvedValue({ data: 'APPLIED', error: null })
    await avisar()
    expect(rpc).toHaveBeenCalledWith(
      'set_plus_subscription',
      expect.objectContaining({ p_takeover: false }),
    )
  })

  it('assinatura sem last_modified passa nulo, e a regra 1 fica desligada nela', async () => {
    ;(provedorFalso.buscarAssinatura as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'preapproval-1',
      status: 'authorized',
      external_reference: PERFIL,
      next_payment_date: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    })
    rpc.mockResolvedValue({ data: 'APPLIED', error: null })
    await avisar()
    expect(rpc).toHaveBeenCalledWith(
      'set_plus_subscription',
      expect.objectContaining({ p_event_at: null }),
    )
  })
})
