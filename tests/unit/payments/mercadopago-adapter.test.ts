import { describe, expect, it, vi } from 'vitest'

import { MercadoPagoProvider } from '@/lib/payments/providers/mercadopago'
import { AppError } from '@/lib/errors'

/**
 * ── O adapter, sem tocar na rede ────────────────────────────────────────────
 *
 * O `fetch` é injetado no construtor justamente para isto. Nenhum teste deste
 * repositório fala com o Mercado Pago — não há credencial aqui, e não pode
 * haver.
 *
 * O que se testa é o que o adapter **monta** e o que ele **recusa**. O que a
 * API responde de verdade, só a produção dirá; por isso a rota do webhook não
 * confia no corpo e reconsulta.
 */

function fetchFalso(resposta: unknown, ok = true, status = 200) {
  const chamadas: { url: string; init: RequestInit }[] = []
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    chamadas.push({ url: String(url), init: init ?? {} })
    return {
      ok,
      status,
      text: async () => JSON.stringify(resposta),
    } as Response
  })
  return { impl: impl as unknown as typeof fetch, chamadas }
}

const PREAPPROVAL = {
  id: 'pre_123',
  status: 'pending',
  init_point: 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=pre_123',
  next_payment_date: '2026-11-01T12:00:00Z',
}

describe('criar a assinatura do Synse+', () => {
  const entrada = {
    providerCustomerId: 'aluno@exemplo.test',
    payerEmail: 'aluno@exemplo.test',
    amount: 29,
    description: 'Synse+',
    method: 'CREDIT_CARD' as const,
    externalReference: 'perfil-abc',
    cycle: 'MONTHLY' as const,
    nextDueDate: '2026-11-01T12:00:00Z',
    trialDays: 30,
    backUrl: 'https://synse.com.br/app/synse',
  }

  it('devolve o checkout para onde mandar a pessoa', async () => {
    const { impl } = fetchFalso(PREAPPROVAL)
    const r = await new MercadoPagoProvider('token', 'segredo', impl).createSubscription(entrada)

    expect(r.providerSubscriptionId).toBe('pre_123')
    expect(r.checkoutUrl).toBe(PREAPPROVAL.init_point)
  })

  it('leva o id do perfil em external_reference', async () => {
    /*
     * É por este campo que o webhook descobre de quem é a assinatura. Perdê-lo
     * deixaria o pagamento sem dono: a pessoa paga e nada liga, sem erro
     * nenhum em lugar nenhum.
     */
    const { impl, chamadas } = fetchFalso(PREAPPROVAL)
    await new MercadoPagoProvider('token', 'segredo', impl).createSubscription(entrada)

    const corpo = JSON.parse(String(chamadas[0].init.body))
    expect(corpo.external_reference).toBe('perfil-abc')
    expect(corpo.payer_email).toBe('aluno@exemplo.test')
    expect(corpo.auto_recurring.transaction_amount).toBe(29)
    expect(corpo.auto_recurring.currency_id).toBe('BRL')
    expect(corpo.auto_recurring.free_trial).toEqual({ frequency: 30, frequency_type: 'days' })
  })

  it('manda chave de idempotência, para retry não criar a segunda assinatura', async () => {
    const { impl, chamadas } = fetchFalso(PREAPPROVAL)
    await new MercadoPagoProvider('token', 'segredo', impl).createSubscription(entrada)

    const cabecalhos = chamadas[0].init.headers as Record<string, string>
    expect(cabecalhos['X-Idempotency-Key']).toBe('plus-perfil-abc')
  })

  it('não nasce autorizada: pending vira PAST_DUE, não ACTIVE', async () => {
    // Quem libera o acesso é o webhook, nunca a criação.
    const { impl } = fetchFalso(PREAPPROVAL)
    const r = await new MercadoPagoProvider('token', 'segredo', impl).createSubscription(entrada)
    expect(r.status).toBe('PAST_DUE')
  })

  it('recusa sem e-mail de pagador em vez de criar algo inútil', async () => {
    const { impl } = fetchFalso(PREAPPROVAL)
    const provider = new MercadoPagoProvider('token', 'segredo', impl)

    await expect(
      provider.createSubscription({ ...entrada, payerEmail: undefined, providerCustomerId: 'x' }),
    ).rejects.toBeInstanceOf(AppError)
  })

  it('erro do Mercado Pago vira AppError, sem vazar o corpo para a tela', async () => {
    const { impl } = fetchFalso({ message: 'cvv_rejected', cause: [{ code: 'E301' }] }, false, 400)
    const provider = new MercadoPagoProvider('token', 'segredo', impl)

    const erro = await provider.createSubscription(entrada).catch((e) => e)
    expect(erro).toBeInstanceOf(AppError)
    expect((erro as AppError).userMessage).not.toContain('cvv_rejected')
  })
})

describe('o que o adapter recusa fazer', () => {
  /*
   * A mensalidade da academia precisa de subconta e split, que no Mercado Pago
   * seguem outro caminho e não foram integrados. Estes métodos lançam em vez
   * de devolver um objeto plausível — dado falso circulando é como a tela do
   * aluno chegou a oferecer um PIX terminado em `6304MOCK`.
   */
  const provider = new MercadoPagoProvider('token', 'segredo', fetchFalso({}).impl)

  it('não diz que suporta marketplace', () => {
    expect(provider.suportaMarketplace).toBe(false)
  })

  it.each([
    ['createPix', () => provider.createPix({} as never)],
    ['createCharge', () => provider.createCharge({} as never)],
    ['createPaymentAccount', () => provider.createPaymentAccount({} as never)],
    ['configureSplit', () => provider.configureSplit('x', {} as never)],
    ['refundCharge', () => provider.refundCharge('x')],
  ])('%s lança, em vez de fingir', async (_nome, chamar) => {
    await expect(chamar()).rejects.toBeInstanceOf(AppError)
  })
})

describe('o webhook', () => {
  it('recusa quando a assinatura não confere', async () => {
    const provider = new MercadoPagoProvider('token', 'segredo', fetchFalso({}).impl)
    const r = await provider.verifyWebhook({
      headers: { 'x-signature': 'ts=1,v1=deadbeef', 'x-request-id': 'r', 'x-data-id': '1' },
      rawBody: '{"type":"subscription_preapproval","data":{"id":"1"}}',
    })
    expect(r.valid).toBe(false)
  })

  it('recusa sem segredo configurado, em vez de aceitar por omissão', async () => {
    const provider = new MercadoPagoProvider('token', '', fetchFalso({}).impl)
    const r = await provider.verifyWebhook({
      headers: { 'x-signature': 'ts=1,v1=abc' },
      rawBody: '{}',
    })
    expect(r.valid).toBe(false)
  })

  it('corpo quebrado não derruba a verificação', async () => {
    const provider = new MercadoPagoProvider('token', 'segredo', fetchFalso({}).impl)
    const r = await provider.verifyWebhook({ headers: {}, rawBody: 'isto não é json' })
    expect(r.valid).toBe(false)
  })
})
