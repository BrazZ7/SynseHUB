import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * ── O envio do aviso ─────────────────────────────────────────────────────────
 *
 * Três propriedades, e as três existem porque a falha delas é silenciosa:
 *
 * 1. **Sem chave VAPID, não tenta.** Uma instalação sem as chaves não pode
 *    derrubar o pedido de amizade que disparou o aviso.
 * 2. **Falha de envio nunca sobe.** O aviso é acessório do que aconteceu; se
 *    o erro subisse, a pessoa veria "não foi possível enviar o pedido" para um
 *    pedido que foi gravado.
 * 3. **Inscrição morta some.** 404 e 410 são o navegador dizendo que aquele
 *    aparelho não existe mais. Guardar faz a tabela crescer com lixo que nunca
 *    entrega nada — e cada aviso futuro paga o custo de tentar.
 */

const sendNotification = vi.fn()
const setVapidDetails = vi.fn()
const deleteIn = vi.fn()

let inscricoes: Array<{ endpoint: string; p256dh: string; auth: string }> = []

vi.mock('web-push', () => ({
  default: {
    setVapidDetails,
    sendNotification: (...args: unknown[]) => sendNotification(...args),
  },
}))

vi.mock('@/lib/database/supabase-admin', () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: async () => ({ data: inscricoes, error: null }) }),
      delete: () => ({ in: (_coluna: string, valores: string[]) => deleteIn(valores) }),
    }),
  }),
}))

async function carregar(comChaves: boolean) {
  vi.resetModules()
  vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', comChaves ? 'chave-publica' : '')
  vi.stubEnv('VAPID_PRIVATE_KEY', comChaves ? 'chave-privada' : '')
  vi.stubEnv('VAPID_SUBJECT', comChaves ? 'mailto:contato@synse.com.br' : '')
  return import('@/lib/push/send')
}

const AVISO = { titulo: 'Oi', corpo: 'tudo bem?' }

beforeEach(() => {
  sendNotification.mockReset().mockResolvedValue(undefined)
  setVapidDetails.mockReset()
  deleteIn.mockReset()
  inscricoes = [
    { endpoint: 'https://push/um', p256dh: 'p1', auth: 'a1' },
    { endpoint: 'https://push/dois', p256dh: 'p2', auth: 'a2' },
  ]
})

describe('enviarAviso', () => {
  it('manda para todos os aparelhos da conta', async () => {
    const { enviarAviso } = await carregar(true)

    expect(await enviarAviso('perfil-1', AVISO)).toBe(2)
    expect(sendNotification).toHaveBeenCalledTimes(2)
  })

  it('sem chave VAPID, não tenta nada', async () => {
    const { enviarAviso } = await carregar(false)

    expect(await enviarAviso('perfil-1', AVISO)).toBe(0)
    expect(sendNotification).not.toHaveBeenCalled()
  })

  it('conta sem aparelho devolve zero, e zero não é erro', async () => {
    inscricoes = []
    const { enviarAviso } = await carregar(true)

    expect(await enviarAviso('perfil-1', AVISO)).toBe(0)
  })

  it('falha de um aparelho não impede o outro nem estoura', async () => {
    sendNotification.mockRejectedValueOnce({ statusCode: 500 })
    const { enviarAviso } = await carregar(true)

    // Um entregue, nenhuma exceção: quem chamou nem fica sabendo.
    await expect(enviarAviso('perfil-1', AVISO)).resolves.toBe(1)
  })

  it('inscrição morta é apagada; a que só falhou, não', async () => {
    sendNotification
      .mockRejectedValueOnce({ statusCode: 410 })
      .mockRejectedValueOnce({ statusCode: 500 })
    const { enviarAviso } = await carregar(true)

    await enviarAviso('perfil-1', AVISO)

    expect(deleteIn).toHaveBeenCalledTimes(1)
    /*
     * Só a de 410. Apagar a que deu 500 perderia o aparelho de alguém por
     * causa de uma instabilidade momentânea do serviço de entrega.
     */
    expect(deleteIn).toHaveBeenCalledWith(['https://push/um'])
  })

  it('o corpo enviado é o aviso, em JSON — é o que o service worker lê', async () => {
    const { enviarAviso } = await carregar(true)
    await enviarAviso('perfil-1', { titulo: 'T', corpo: 'C', url: '/app/friends', tag: 'x' })

    const [, corpo] = sendNotification.mock.calls[0]
    expect(JSON.parse(corpo as string)).toEqual({
      titulo: 'T',
      corpo: 'C',
      url: '/app/friends',
      tag: 'x',
    })
  })
})
