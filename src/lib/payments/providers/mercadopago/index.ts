import 'server-only'

import { AppError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import {
  MERCADOPAGO_ACCESS_TOKEN,
  MERCADOPAGO_WEBHOOK_SECRET,
} from '@/lib/payments/providers/mercadopago/env'
import {
  conferirAssinatura,
  estadoDoPlus,
  type PreapprovalDoMercadoPago,
} from '@/lib/payments/providers/mercadopago/assinatura'
import type {
  CreateChargeInput,
  CreateCustomerInput,
  CreatePaymentAccountInput,
  CreateSubscriptionInput,
  PaymentProvider,
  ProviderCharge,
  ProviderCustomer,
  ProviderPaymentAccount,
  ProviderPixCharge,
  ProviderSubscription,
  SplitConfiguration,
  WebhookVerification,
} from '@/lib/payments/provider'
import type { PaymentMethod } from '@/types/domain'

/**
 * ── O adapter do Mercado Pago ────────────────────────────────────────────────
 *
 * Escrito para **um** produto: a assinatura do Synse+. Dinheiro que entra na
 * conta do Synse, sem academia no meio, sem divisão.
 *
 * ── O que ele não faz, e por que isso está escrito e não escondido ──────────
 *
 * A mensalidade da academia precisa de subconta e split, e no Mercado Pago
 * isso é outro caminho: OAuth de cada academia, KYC nível 6, e `application_fee`
 * em cada `/v1/payments` — porque o `preapproval` não carrega comissão, não há
 * campo para ela na referência da API.
 *
 * Esses métodos **lançam** em vez de devolver qualquer coisa. A alternativa
 * seria devolver um objeto plausível, e já sabemos no que dá: foi assim que a
 * tela do aluno chegou a oferecer um PIX terminado em `6304MOCK`. Erro alto na
 * primeira chamada é melhor do que dado falso circulando.
 *
 * `suportaMarketplace = false` é o que impede a tela de cobrança da academia
 * de sequer oferecer o botão — a trava está antes do clique, não depois.
 *
 * ── Nenhum dado de cartão passa por aqui ────────────────────────────────────
 *
 * O `preapproval` nasce `pending` e devolve um `init_point`. Quem digita o
 * cartão é o checkout do Mercado Pago, no domínio dele. Este servidor nunca vê
 * um PAN.
 */

const API = 'https://api.mercadopago.com'

/** Quanto esperar o Mercado Pago antes de desistir. */
const TIMEOUT_MS = 10_000

const CICLO: Record<CreateSubscriptionInput['cycle'], { frequency: number; type: string }> = {
  MONTHLY: { frequency: 1, type: 'months' },
  QUARTERLY: { frequency: 3, type: 'months' },
  SEMIANNUAL: { frequency: 6, type: 'months' },
  ANNUAL: { frequency: 12, type: 'months' },
}

function naoImplementado(metodo: string): never {
  throw new AppError(
    'provider_sem_marketplace',
    'Este provedor de pagamento não cobra em nome da academia.',
    501,
    `mercadopago: ${metodo} exige subconta e split, que seguem o caminho de OAuth do Mercado Pago e ainda não foram integrados.`,
  )
}

export class MercadoPagoProvider implements PaymentProvider {
  readonly id = 'mercadopago'
  /** Só o que a assinatura usa. A UI da academia lê `suportaMarketplace`. */
  readonly supportedMethods: PaymentMethod[] = ['CREDIT_CARD', 'PIX']
  readonly suportaMarketplace = false

  constructor(
    private readonly token: string = MERCADOPAGO_ACCESS_TOKEN,
    private readonly segredoDoWebhook: string = MERCADOPAGO_WEBHOOK_SECRET,
    /** Injetável para teste: nenhum teste deste repositório fala com a rede. */
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async chamar<T>(
    caminho: string,
    init: { method: string; body?: unknown; idempotencia?: string } = { method: 'GET' },
  ): Promise<T> {
    const cabecalhos: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    }
    /*
     * Chave de idempotência nas escritas. Sem ela, um `retry` depois de um
     * timeout cria uma segunda assinatura para a mesma pessoa — e a segunda
     * cobra de verdade.
     */
    if (init.idempotencia) cabecalhos['X-Idempotency-Key'] = init.idempotencia

    const resposta = await this.fetchImpl(`${API}${caminho}`, {
      method: init.method,
      headers: cabecalhos,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    const texto = await resposta.text()
    if (!resposta.ok) {
      /*
       * O corpo do erro do Mercado Pago pode trazer dado do pagador. Vai para
       * o log do servidor, recortado, e nunca para a tela: `userMessage` é
       * genérica de propósito.
       */
      logger.error('mercadopago:erro_api', {
        caminho,
        status: resposta.status,
        corpo: texto.slice(0, 500),
      })
      throw new AppError(
        'mercadopago_falhou',
        'Não foi possível falar com o Mercado Pago agora. Tente de novo em instantes.',
        502,
        `mercadopago ${init.method} ${caminho} -> ${resposta.status}`,
      )
    }

    return (texto ? JSON.parse(texto) : {}) as T
  }

  async createCustomer(input: CreateCustomerInput): Promise<ProviderCustomer> {
    /*
     * O `preapproval` identifica o pagador pelo e-mail, não por um cliente
     * criado antes. Criar um registro no Mercado Pago só para ter um id seria
     * uma ida à rede que nada consome — e um id que nenhuma chamada usa.
     */
    return {
      providerCustomerId: input.email,
      name: input.name,
      email: input.email,
    }
  }

  /**
   * Cria a assinatura e devolve para onde mandar a pessoa.
   *
   * `external_reference` carrega o `user_profile_id`: é por ele que o webhook
   * descobre de quem é a assinatura, sem precisar de uma tabela de ligação que
   * poderia divergir do Mercado Pago.
   */
  async createSubscription(input: CreateSubscriptionInput): Promise<ProviderSubscription> {
    const email = input.payerEmail ?? input.providerCustomerId
    if (!email.includes('@')) {
      throw new AppError(
        'mercadopago_sem_email',
        'Não foi possível identificar o e-mail do pagador.',
        400,
        'mercadopago: createSubscription exige payerEmail',
      )
    }

    const ciclo = CICLO[input.cycle]
    const corpo = {
      reason: input.description,
      external_reference: input.externalReference,
      payer_email: email,
      back_url: input.backUrl,
      auto_recurring: {
        frequency: ciclo.frequency,
        frequency_type: ciclo.type,
        transaction_amount: input.amount,
        currency_id: 'BRL',
        ...(input.trialDays && input.trialDays > 0
          ? { free_trial: { frequency: input.trialDays, frequency_type: 'days' } }
          : {}),
      },
      status: 'pending',
    }

    const criado = await this.chamar<
      PreapprovalDoMercadoPago & { init_point?: string; sandbox_init_point?: string }
    >('/preapproval', {
      method: 'POST',
      body: corpo,
      // Uma assinatura por referência externa: reenviar não cria a segunda.
      idempotencia: `plus-${input.externalReference}`,
    })

    if (!criado.id) {
      throw new AppError(
        'mercadopago_sem_id',
        'O Mercado Pago não devolveu a assinatura. Tente de novo.',
        502,
        'mercadopago: /preapproval respondeu sem id',
      )
    }

    return {
      providerSubscriptionId: criado.id,
      status: criado.status === 'authorized' ? 'ACTIVE' : 'PAST_DUE',
      nextDueDate: criado.next_payment_date ?? input.nextDueDate,
      checkoutUrl: criado.init_point ?? criado.sandbox_init_point,
    }
  }

  /** O estado atual de uma assinatura, direto da fonte. */
  async buscarAssinatura(preapprovalId: string): Promise<PreapprovalDoMercadoPago> {
    return this.chamar<PreapprovalDoMercadoPago>(`/preapproval/${preapprovalId}`)
  }

  /** Cancela a renovação. O ciclo já pago continua valendo — ver `estadoDoPlus`. */
  async cancelarAssinatura(preapprovalId: string): Promise<PreapprovalDoMercadoPago> {
    return this.chamar<PreapprovalDoMercadoPago>(`/preapproval/${preapprovalId}`, {
      method: 'PUT',
      body: { status: 'cancelled' },
    })
  }

  /**
   * Confere a assinatura do webhook — e só isso.
   *
   * Nada do corpo vira estado aqui. Quem decide o que aconteceu é a rota, que
   * reconsulta o Mercado Pago com o id conferido. O corpo de um webhook é
   * escrito por quem o envia, e nem sempre é quem a gente pensa.
   */
  async verifyWebhook(input: {
    headers: Record<string, string>
    rawBody: string
  }): Promise<WebhookVerification> {
    const cabecalho = (nome: string) =>
      input.headers[nome] ?? input.headers[nome.toLowerCase()] ?? null

    let corpo: { id?: string | number; type?: string; action?: string; data?: { id?: string } } = {}
    try {
      corpo = JSON.parse(input.rawBody || '{}')
    } catch {
      corpo = {}
    }

    const dataId = cabecalho('x-data-id') ?? (corpo.data?.id != null ? String(corpo.data.id) : null)

    const conferencia = conferirAssinatura({
      header: cabecalho('x-signature'),
      requestId: cabecalho('x-request-id'),
      dataId,
      segredo: this.segredoDoWebhook,
    })

    if (!conferencia.valida) {
      logger.warn('mercadopago:webhook_recusado', { motivo: conferencia.motivo })
      return { valid: false, eventId: '', eventType: corpo.type ?? '' }
    }

    return {
      valid: true,
      /*
       * O id do evento é o do recurso mais a ação. O Mercado Pago reenvia o
       * mesmo `data.id` a cada mudança de estado, então usar só ele faria a
       * idempotência de `webhook_events` descartar a renovação do mês seguinte
       * como se fosse repetição.
       */
      eventId: `${dataId}:${corpo.action ?? corpo.type ?? 'evento'}:${cabecalho('x-request-id') ?? ''}`,
      eventType: corpo.action ?? corpo.type ?? '',
      providerChargeId: dataId ?? undefined,
    }
  }

  async getPayment(providerChargeId: string): Promise<ProviderCharge> {
    const pago = await this.chamar<{
      id: string
      status: string
      transaction_amount: number
      date_approved?: string | null
      date_created?: string
      payment_method_id?: string
    }>(`/v1/payments/${providerChargeId}`)

    const estado: ProviderCharge['status'] =
      pago.status === 'approved'
        ? 'PAID'
        : pago.status === 'refunded'
          ? 'REFUNDED'
          : pago.status === 'cancelled'
            ? 'CANCELLED'
            : pago.status === 'rejected'
              ? 'FAILED'
              : 'PENDING'

    return {
      providerChargeId: pago.id,
      status: estado,
      amount: pago.transaction_amount,
      dueDate: (pago.date_approved ?? pago.date_created ?? new Date().toISOString()).slice(0, 10),
      method: pago.payment_method_id === 'pix' ? 'PIX' : 'CREDIT_CARD',
    }
  }

  // ── O que pertence ao Synse Pay, e ainda não existe ────────────────────────

  async createCharge(_input: CreateChargeInput): Promise<ProviderCharge> {
    return naoImplementado('createCharge')
  }

  async createPix(_input: Omit<CreateChargeInput, 'method'>): Promise<ProviderPixCharge> {
    return naoImplementado('createPix')
  }

  async cancelCharge(_providerChargeId: string): Promise<void> {
    return naoImplementado('cancelCharge')
  }

  async refundCharge(_providerChargeId: string, _amount?: number): Promise<void> {
    return naoImplementado('refundCharge')
  }

  async createPaymentAccount(_input: CreatePaymentAccountInput): Promise<ProviderPaymentAccount> {
    return naoImplementado('createPaymentAccount')
  }

  async configureSplit(_providerChargeId: string, _split: SplitConfiguration): Promise<void> {
    return naoImplementado('configureSplit')
  }
}

export { estadoDoPlus }
