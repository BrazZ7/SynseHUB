import { beforeEach, describe, expect, it, vi } from 'vitest'

import { initialInscricaoState } from '@/features/events/state'

/**
 * ── A primeira escrita do produto sem sessão ────────────────────────────────
 *
 * Todas as outras actions começam com `requireHubSession` ou
 * `requireStudentSession`, e é a sessão que diz quem é e o que pode. Esta não
 * tem ninguém: a corrida de inauguração existe para trazer gente de fora, e
 * quem chega pelo link não tem conta.
 *
 * O que substitui a sessão, e o que estes testes travam:
 *
 * 1. **A validação é anterior a qualquer escrita.** Campo errado não chega ao
 *    banco.
 * 2. **O aceite da política é obrigatório.** CPF e telefone de quem nunca foi
 *    cliente, guardados sem base registrada, é dado sem base — e a versão
 *    aceita viaja com a inscrição.
 * 3. **O CPF é conferido pelos dígitos**, não pelo tamanho.
 * 4. **A recusa diz o que houve.** O genérico "tente novamente" num CPF já
 *    inscrito convida a pessoa a tentar para sempre.
 */

const dataSource = { inscreverNoEvento: vi.fn() }
const limite = { permitido: true }

vi.mock('@/lib/database', () => ({ getDataSource: async () => dataSource }))
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: async () => ({ allowed: limite.permitido }),
}))
vi.mock('next/headers', () => ({
  headers: async () => new Map([['x-forwarded-for', '203.0.113.9']]),
}))

const { inscreverAction } = await import('@/features/events/inscricao')

const CAMPOS = {
  eventId: 'evt_1',
  fullName: 'Sofia Gomes',
  email: 'sofia@exemplo.com',
  phone: '11999990000',
  taxId: '529.982.247-25',
  privacidade: 'on',
}

function form(sobrescreve: Record<string, string | undefined> = {}) {
  const fd = new FormData()
  for (const [chave, valor] of Object.entries({ ...CAMPOS, ...sobrescreve })) {
    if (valor !== undefined) fd.set(chave, valor)
  }
  return fd
}

const enviar = (sobrescreve?: Record<string, string | undefined>) =>
  inscreverAction(initialInscricaoState, form(sobrescreve))

beforeEach(() => {
  limite.permitido = true
  dataSource.inscreverNoEvento.mockReset()
  dataSource.inscreverNoEvento.mockResolvedValue({
    confirmationCode: 'abc123abc123abc1',
    status: 'PENDING_PAYMENT',
  })
})

describe('inscreverAction', () => {
  it('inscreve e devolve o código', async () => {
    const r = await enviar()

    expect(r.status).toBe('success')
    expect(r.codigo).toBe('abc123abc123abc1')
  })

  it('o CPF viaja só com dígitos', async () => {
    // O banco guarda onze dígitos; a máscara é da tela.
    await enviar()
    expect(dataSource.inscreverNoEvento).toHaveBeenCalledWith(
      expect.objectContaining({ taxId: '52998224725' }),
    )
  })

  it('a versão da política vai junto, e não vem do formulário', async () => {
    /*
     * Se viesse do formulário, a prova do consentimento seria a palavra de
     * quem está sendo provado. Ela sai da configuração do servidor.
     */
    await enviar({ privacyVersion: 'inventada' })
    const [input] = dataSource.inscreverNoEvento.mock.calls[0]
    expect(input.privacyVersion).toBeTruthy()
    expect(input.privacyVersion).not.toBe('inventada')
  })

  it('sem aceitar a política, não escreve nada', async () => {
    const r = await enviar({ privacidade: undefined })

    expect(r.status).toBe('error')
    expect(r.fieldErrors?.privacidade).toBeTruthy()
    expect(dataSource.inscreverNoEvento).not.toHaveBeenCalled()
  })

  it('CPF com onze dígitos e verificador errado não passa', async () => {
    // O `check` do banco exige onze dígitos — e onze dígitos não é CPF.
    for (const cpf of ['11111111111', '12345678900', '123']) {
      dataSource.inscreverNoEvento.mockClear()
      const r = await enviar({ taxId: cpf })
      expect(r.fieldErrors?.taxId, cpf).toBeTruthy()
      expect(dataSource.inscreverNoEvento).not.toHaveBeenCalled()
    }
  })

  it('e-mail e telefone são conferidos antes de ir ao banco', async () => {
    const semEmail = await enviar({ email: 'sofia@exemplo' })
    expect(semEmail.fieldErrors?.email).toBeTruthy()

    const semTelefone = await enviar({ phone: '999' })
    expect(semTelefone.fieldErrors?.phone).toBeTruthy()

    expect(dataSource.inscreverNoEvento).not.toHaveBeenCalled()
  })

  it('tamanho de camiseta fora da lista é recusado', async () => {
    const r = await enviar({ shirtSize: 'XXG' })
    expect(r.fieldErrors?.shirtSize).toBeTruthy()
  })

  it('CPF já inscrito diz o que houve, em vez de "tente novamente"', async () => {
    /*
     * Visto no navegador antes de existir este teste: a tela mostrava "Não
     * foi possível concluir esta operação. Tente novamente." — o pior texto
     * possível, porque convida a repetir uma coisa que nunca vai dar certo.
     */
    dataSource.inscreverNoEvento.mockRejectedValue(
      new Error('supabase query failed: inscreverNoEvento', {
        cause: {
          code: '23505',
          message: 'duplicate key value violates unique constraint "event_registrations_sem_repeticao_idx"',
        },
      }),
    )

    const r = await enviar()

    expect(r.status).toBe('error')
    expect(r.message).toContain('CPF já tem inscrição')
    expect(r.message).not.toContain('event_registrations')
    // E o erro aponta o campo, para a tela destacar onde está o problema.
    expect(r.fieldErrors?.taxId).toBeTruthy()
  })

  it('as recusas de regra do banco chegam como foram escritas', async () => {
    dataSource.inscreverNoEvento.mockRejectedValue(
      Object.assign(new Error('As inscrições já encerraram.'), { code: '22023' }),
    )

    const r = await enviar()
    expect(r.message).toBe('As inscrições já encerraram.')
  })

  it('erro desconhecido não vira frase tranquilizadora', async () => {
    // Falha de rede não pode virar recado sobre inscrição.
    dataSource.inscreverNoEvento.mockRejectedValue(new Error('ECONNRESET'))

    const r = await enviar()
    expect(r.status).toBe('error')
    expect(r.message).not.toContain('CPF')
    expect(r.message).not.toContain('encerraram')
  })

  it('o limite por endereço recusa antes de escrever', async () => {
    /*
     * Sem sessão, a chave do limite é o endereço do proxy. Não é identidade
     * — é o que impede um laço de encher a tabela de CPF inventado enquanto
     * ninguém olha.
     */
    limite.permitido = false

    const r = await enviar()

    expect(r.status).toBe('error')
    expect(r.message).toContain('Muitas tentativas')
    expect(dataSource.inscreverNoEvento).not.toHaveBeenCalled()
  })
})
