import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AsaasPaymentProvider } from '@/lib/payments/providers/asaas'

/**
 * O adapter do Asaas é a fronteira entre a linguagem do gateway e a do Synse.
 * Errar a tradução não quebra nada visivelmente: o pagamento simplesmente não é
 * reconhecido, ou o split vai para a conta errada.
 *
 * Aqui o `fetch` é substituído para exercitar a tradução sem tocar na rede.
 * O teste contra a API de verdade vive em `tests/integration/asaas.test.ts` e
 * só roda com ASAAS_API_KEY presente.
 */

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function responder(body: unknown, ok = true, status = 200) {
  fetchMock.mockResolvedValue({
    ok,
    status,
    text: async () => JSON.stringify(body),
  } as Response)
}

/** Corpo enviado na chamada de índice `n`. */
function corpoEnviado(n = 0) {
  return JSON.parse(String(fetchMock.mock.calls[n][1].body))
}

const provider = () => new AsaasPaymentProvider({ apiUrl: 'https://api.teste/v3', apiKey: 'chave' })

describe('tradução de cobrança', () => {
  it('converte método do Synse para billingType do Asaas', async () => {
    responder({ id: 'pay_1', status: 'PENDING', value: 100, dueDate: '2026-10-01' })

    await provider().createCharge({
      providerCustomerId: 'cus_1',
      amount: 100,
      dueDate: '2026-10-01',
      description: 'Mensalidade',
      method: 'CREDIT_CARD_RECURRING',
      externalReference: 'charge-1',
    })

    expect(corpoEnviado().billingType).toBe('CREDIT_CARD')
  })

  it('trata RECEIVED_IN_CASH como pago — é dinheiro que entrou', async () => {
    responder({ id: 'pay_1', status: 'RECEIVED_IN_CASH', value: 100, dueDate: '2026-10-01' })

    const cobranca = await provider().getPayment('pay_1')

    expect(cobranca.status).toBe('PAID')
  })

  /*
   * Pego contra o sandbox real: o Asaas não muda o `status` ao cancelar, marca
   * `deleted`. O adapter olhava só o status e devolvia PENDENTE — a academia
   * seguiria cobrando alguém que não deve mais nada.
   */
  it('reconhece cancelamento por `deleted`, mesmo com status PENDING', async () => {
    responder({ id: 'pay_1', status: 'PENDING', deleted: true, value: 100, dueDate: '2026-10-01' })

    const cobranca = await provider().getPayment('pay_1')

    expect(cobranca.status).toBe('CANCELLED')
  })

  it('`deleted: false` não interfere no status normal', async () => {
    responder({
      id: 'pay_1',
      status: 'RECEIVED',
      deleted: false,
      value: 100,
      dueDate: '2026-10-01',
    })

    const cobranca = await provider().getPayment('pay_1')

    expect(cobranca.status).toBe('PAID')
  })

  it('não inventa status: o desconhecido vira PENDENTE, nunca PAGO', async () => {
    responder({
      id: 'pay_1',
      status: 'ALGO_QUE_O_ASAAS_INVENTOU',
      value: 100,
      dueDate: '2026-10-01',
    })

    const cobranca = await provider().getPayment('pay_1')

    expect(cobranca.status).toBe('PENDING')
  })

  it('nunca envia o cartão, só o token gerado no cliente', async () => {
    responder({ id: 'pay_1', status: 'PENDING', value: 100, dueDate: '2026-10-01' })

    await provider().createCharge({
      providerCustomerId: 'cus_1',
      amount: 100,
      dueDate: '2026-10-01',
      description: 'Mensalidade',
      method: 'CREDIT_CARD',
      externalReference: 'charge-1',
      cardToken: 'tok_abc',
    })

    const corpo = corpoEnviado()
    expect(corpo.creditCardToken).toBe('tok_abc')
    expect(JSON.stringify(corpo)).not.toMatch(/creditCard"\s*:\s*\{/)
  })
})

describe('split', () => {
  it('manda percentual e carteira da plataforma', async () => {
    responder({ id: 'pay_1', status: 'PENDING', value: 200, dueDate: '2026-10-01' })

    await provider().createCharge({
      providerCustomerId: 'cus_1',
      amount: 200,
      dueDate: '2026-10-01',
      description: 'Mensalidade',
      method: 'PIX',
      externalReference: 'charge-1',
      split: { providerAccountId: 'wallet_synse', platformPercentage: 2, platformFixedFee: 0 },
    })

    expect(corpoEnviado().split).toEqual([{ walletId: 'wallet_synse', percentualValue: 2 }])
  })

  it('omite o campo fixo quando é zero, em vez de mandar 0', async () => {
    responder({ id: 'pay_1', status: 'PENDING', value: 200, dueDate: '2026-10-01' })

    await provider().createCharge({
      providerCustomerId: 'cus_1',
      amount: 200,
      dueDate: '2026-10-01',
      description: 'Mensalidade',
      method: 'PIX',
      externalReference: 'charge-1',
      split: { providerAccountId: 'wallet_synse', platformPercentage: 2, platformFixedFee: 0 },
    })

    expect(corpoEnviado().split[0]).not.toHaveProperty('fixedValue')
  })

  it('sem split configurado, não manda o campo', async () => {
    responder({ id: 'pay_1', status: 'PENDING', value: 200, dueDate: '2026-10-01' })

    await provider().createCharge({
      providerCustomerId: 'cus_1',
      amount: 200,
      dueDate: '2026-10-01',
      description: 'Mensalidade',
      method: 'PIX',
      externalReference: 'charge-1',
    })

    expect(corpoEnviado().split).toBeUndefined()
  })
})

describe('webhook', () => {
  const evento = JSON.stringify({
    id: 'evt_1',
    event: 'PAYMENT_RECEIVED',
    payment: {
      id: 'pay_1',
      status: 'RECEIVED',
      paymentDate: '2026-09-11',
      netValue: 97.5,
      billingType: 'PIX',
    },
  })

  it('aceita com o token correto e normaliza o evento', async () => {
    vi.stubEnv('ASAAS_WEBHOOK_TOKEN', 'segredo-do-webhook')

    const resultado = await provider().verifyWebhook({
      headers: { 'asaas-access-token': 'segredo-do-webhook' },
      rawBody: evento,
    })

    expect(resultado).toMatchObject({
      valid: true,
      eventId: 'evt_1',
      status: 'PAID',
      providerChargeId: 'pay_1',
      netAmount: 97.5,
    })
  })

  it('recusa token errado', async () => {
    vi.stubEnv('ASAAS_WEBHOOK_TOKEN', 'segredo-do-webhook')

    const resultado = await provider().verifyWebhook({
      headers: { 'asaas-access-token': 'chute' },
      rawBody: evento,
    })

    expect(resultado.valid).toBe(false)
  })

  /*
   * O caso que mais assusta: sem token configurado, aceitar por omissão
   * deixaria qualquer um confirmar pagamento com um POST.
   */
  it('recusa tudo quando não há token configurado', async () => {
    vi.stubEnv('ASAAS_WEBHOOK_TOKEN', '')

    const resultado = await provider().verifyWebhook({
      headers: { 'asaas-access-token': '' },
      rawBody: evento,
    })

    expect(resultado.valid).toBe(false)
  })

  it('recusa quando o cabeçalho nem vem', async () => {
    vi.stubEnv('ASAAS_WEBHOOK_TOKEN', 'segredo-do-webhook')

    const resultado = await provider().verifyWebhook({ headers: {}, rawBody: evento })

    expect(resultado.valid).toBe(false)
  })
})

describe('falhas de rede e da API', () => {
  it('não vaza corpo de erro do provedor para quem chamou', async () => {
    responder({ errors: [{ description: 'CPF do pagador inválido: 123.456.789-00' }] }, false, 400)

    /*
     * A resposta de erro do Asaas carrega dado do pagador. A mensagem que sobe
     * é a genérica de `AppError`; o corpo cru fica só no log do servidor.
     */
    const erro = await provider()
      .getPayment('pay_1')
      .catch((e) => e)

    expect(erro).toMatchObject({
      code: 'provider_unavailable',
      userMessage: expect.stringMatching(/provedor de pagamentos/i),
    })
    expect(JSON.stringify(erro.userMessage)).not.toMatch(/123\.456/)
  })

  it('falha explicitamente sem ASAAS_API_KEY, em vez de chamar sem credencial', async () => {
    const semChave = new AsaasPaymentProvider({ apiUrl: 'https://api.teste/v3', apiKey: '' })

    await expect(semChave.getPayment('pay_1')).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('abertura de subconta', () => {
  /*
   * Recusa do provedor não é indisponibilidade. Tratar as duas igual manda a
   * dona da academia tentar de novo para sempre, quando o que falta é corrigir
   * um dado que só ela pode corrigir.
   */
  it('repassa o motivo quando o provedor recusa os dados da academia', async () => {
    responder(
      { errors: [{ code: 'invalid_birthDate', description: 'Data de nascimento é obrigatória.' }] },
      false,
      400,
    )

    const erro = await provider()
      .createPaymentAccount({
        organizationId: 'org-1',
        legalName: 'Academia Alpha LTDA',
        email: 'dona@alpha.com.br',
        taxId: '11222333000181',
      })
      .catch((e) => e)

    expect(erro).toMatchObject({ code: 'provider_rejected' })
    expect(erro.userMessage).toContain('Data de nascimento é obrigatória.')
  })

  /*
   * 403 tem um significado só: a chave vale, mas a conta não tem o recurso de
   * abrir subconta. Nenhuma tentativa resolve, então dizer "tente novamente"
   * seria mentira — e foi o que a tela dizia antes.
   */
  it('nomeia a falta de permissão para abrir subconta', async () => {
    responder({}, false, 403)

    const erro = await provider()
      .createPaymentAccount({
        organizationId: 'org-1',
        legalName: 'Academia Alpha LTDA',
        email: 'dona@alpha.com.br',
        taxId: '11222333000181',
      })
      .catch((e) => e)

    expect(erro.userMessage).toContain('não tem permissão para abrir subcontas')
    expect(erro.userMessage).toContain('não adianta tentar de novo')
  })

  /*
   * Sem explicação do provedor, a referência técnica é o que sobra — e é
   * melhor que "tente novamente", que manda repetir um clique que nunca vai
   * funcionar. Verbo, rota e status não são dado de ninguém.
   */
  it('mostra a referência técnica quando o provedor não explica', async () => {
    responder({}, false, 503)

    const erro = await provider()
      .createPaymentAccount({
        organizationId: 'org-1',
        legalName: 'Academia Alpha LTDA',
        email: 'dona@alpha.com.br',
        taxId: '11222333000181',
      })
      .catch((e) => e)

    expect(erro).toMatchObject({ code: 'provider_rejected' })
    expect(erro.userMessage).toContain('HTTP 503')
    expect(erro.userMessage).toContain('/accounts')
  })

  /*
   * A recusa em cobrança cita dado do pagador — CPF, nome. Essa continua
   * escondida atrás da mensagem genérica, ao contrário da abertura de conta.
   */
  it('cobrança recusada não expõe o motivo, que fala do pagador', async () => {
    responder(
      { errors: [{ code: 'invalid_customer', description: 'CPF do pagador inválido: 123...' }] },
      false,
      400,
    )

    const erro = await provider()
      .getPayment('pay_1')
      .catch((e) => e)

    expect(erro).toMatchObject({ code: 'provider_unavailable' })
    expect(erro.userMessage).not.toContain('123')
  })

  it('guarda a credencial devolvida na criação', async () => {
    responder({ walletId: 'wallet_alpha', apiKey: '$aact_chave_da_subconta' })

    const conta = await provider().createPaymentAccount({
      organizationId: 'org-1',
      legalName: 'Academia Alpha LTDA',
      email: 'dona@alpha.com.br',
      taxId: '11222333000181',
    })

    expect(conta).toMatchObject({
      providerAccountId: 'wallet_alpha',
      apiKey: '$aact_chave_da_subconta',
    })
  })
})

describe('campos exigidos na abertura de subconta', () => {
  /*
   * A primeira tentativa real foi recusada por falta de CEP e tipo de empresa.
   * Abrir subconta é abrir conta de pagamento: o provedor precisa saber quem é
   * a empresa, onde fica e quanto movimenta. Este teste existe para nenhum
   * desses campos se perder numa refatoração — a falha só apareceria de novo na
   * primeira academia tentando conectar.
   */
  it('traduz endereço, contato e natureza jurídica para o vocabulário do Asaas', async () => {
    responder({ walletId: 'wallet_alpha', apiKey: 'chave' })

    await provider().createPaymentAccount({
      organizationId: 'org-1',
      legalName: 'Academia Alpha LTDA',
      email: 'dona@alpha.com.br',
      taxId: '11222333000181',
      companyType: 'LIMITED',
      postalCode: '01310100',
      address: 'Avenida Paulista',
      addressNumber: '1000',
      district: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP',
      phone: '11988887777',
      monthlyRevenue: 15000,
    })

    expect(corpoEnviado()).toMatchObject({
      cpfCnpj: '11222333000181',
      companyType: 'LIMITED',
      postalCode: '01310100',
      address: 'Avenida Paulista',
      addressNumber: '1000',
      // O Asaas chama bairro de `province`.
      province: 'Bela Vista',
      mobilePhone: '11988887777',
      incomeValue: 15000,
    })
  })

  it('omite o que não foi informado, em vez de mandar nulo', async () => {
    responder({ walletId: 'wallet_alpha', apiKey: 'chave' })

    await provider().createPaymentAccount({
      organizationId: 'org-1',
      legalName: 'Estúdio Beta',
      email: 'dono@beta.com.br',
      taxId: '24971563792',
      companyType: null,
      postalCode: null,
    })

    const corpo = corpoEnviado()
    expect(corpo).not.toHaveProperty('companyType')
    expect(corpo).not.toHaveProperty('postalCode')
  })
})
