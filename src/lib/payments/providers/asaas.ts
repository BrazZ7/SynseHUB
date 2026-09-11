import 'server-only'

import { providerUnavailable } from '@/lib/errors'
import { logger } from '@/lib/logger'
import type {
  CreateChargeInput,
  CreateCustomerInput,
  CreateSubscriptionInput,
  PaymentProvider,
  ProviderCharge,
  ProviderPaymentAccount,
  ProviderPixCharge,
  ProviderSubscription,
  SplitConfiguration,
  WebhookVerification,
} from '@/lib/payments/provider'
import type { PaymentMethod } from '@/types/domain'
import { env } from '@/lib/env'

/**
 * Adapter Asaas.
 *
 * Todo o vocabulário do Asaas (billingType, PIX_QRCODE, PAYMENT_RECEIVED…) fica
 * confinado a este arquivo. O restante do sistema conhece apenas
 * `PaymentProvider`.
 *
 * ⚠️ Integração real, ainda não exercitada contra a API: o projeto roda com
 * `PAYMENT_PROVIDER=mock` até que `ASAAS_API_KEY` seja configurada. Antes de ir
 * a produção, validar em sandbox os campos de split e o formato do webhook.
 */

type AsaasBillingType = 'PIX' | 'BOLETO' | 'CREDIT_CARD' | 'UNDEFINED'

const METHOD_TO_BILLING_TYPE: Record<string, AsaasBillingType> = {
  PIX: 'PIX',
  PIX_AUTOMATIC: 'PIX',
  BOLETO: 'BOLETO',
  CREDIT_CARD: 'CREDIT_CARD',
  CREDIT_CARD_RECURRING: 'CREDIT_CARD',
}

const ASAAS_STATUS_MAP: Record<string, ProviderCharge['status']> = {
  PENDING: 'PENDING',
  AWAITING_RISK_ANALYSIS: 'PENDING',
  CONFIRMED: 'PAID',
  RECEIVED: 'PAID',
  RECEIVED_IN_CASH: 'PAID',
  OVERDUE: 'OVERDUE',
  REFUNDED: 'REFUNDED',
  REFUND_REQUESTED: 'REFUNDED',
  CHARGEBACK_REQUESTED: 'FAILED',
  CHARGEBACK_DISPUTE: 'FAILED',
  DELETED: 'CANCELLED',
}

/** Eventos do Asaas que confirmam recebimento. */
const PAID_EVENTS = new Set(['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'PAYMENT_RECEIVED_IN_CASH'])

export class AsaasPaymentProvider implements PaymentProvider {
  readonly id = 'asaas'
  readonly supportedMethods: PaymentMethod[] = [
    'PIX',
    'BOLETO',
    'CREDIT_CARD',
    'CREDIT_CARD_RECURRING',
  ]

  private readonly apiUrl: string
  private readonly apiKey: string

  constructor(config?: { apiUrl?: string; apiKey?: string }) {
    this.apiUrl =
      config?.apiUrl ?? env(process.env.ASAAS_API_URL, 'https://api-sandbox.asaas.com/v3')
    this.apiKey = config?.apiKey ?? env(process.env.ASAAS_API_KEY, '')
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    if (!this.apiKey) throw providerUnavailable('asaas: missing ASAAS_API_KEY')

    let response: Response
    try {
      response = await fetch(`${this.apiUrl}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          access_token: this.apiKey,
          ...(init?.headers ?? {}),
        },
        cache: 'no-store',
      })
    } catch (error) {
      logger.error('asaas:network_error', { path, error: String(error) })
      throw providerUnavailable('asaas', `rede em ${init?.method ?? 'GET'} ${path}`)
    }

    const text = await response.text()
    if (!response.ok) {
      // O corpo pode conter dado do pagador — não propagar para a UI.
      logger.error('asaas:http_error', { path, status: response.status, body: text.slice(0, 500) })
      throw providerUnavailable(
        'asaas',
        `HTTP ${response.status} em ${init?.method ?? 'GET'} ${path}${descreverErro(text)}`,
      )
    }
    return (text ? JSON.parse(text) : {}) as T
  }

  private splitPayload(split?: SplitConfiguration) {
    if (!split) return undefined
    return [
      {
        walletId: split.providerAccountId,
        percentualValue: split.platformPercentage,
        ...(split.platformFixedFee > 0 ? { fixedValue: split.platformFixedFee } : {}),
      },
    ]
  }

  private toProviderCharge(raw: Record<string, unknown>): ProviderCharge {
    /*
     * Cancelamento não aparece em `status`.
     *
     * Verificado contra o sandbox: depois de DELETE /payments/{id}, a consulta
     * devolve a cobrança com `deleted: true` e o `status` intacto — PENDING, se
     * era o caso. Confiar só no status faria a academia continuar cobrando um
     * aluno cuja cobrança já foi cancelada.
     */
    const cancelada = raw.deleted === true

    return {
      providerChargeId: String(raw.id),
      status: cancelada ? 'CANCELLED' : (ASAAS_STATUS_MAP[String(raw.status)] ?? 'PENDING'),
      amount: Number(raw.value ?? 0),
      dueDate: String(raw.dueDate ?? ''),
      method: (String(raw.billingType) as PaymentMethod) ?? 'PIX',
      invoiceUrl: raw.invoiceUrl ? String(raw.invoiceUrl) : undefined,
      bankSlipUrl: raw.bankSlipUrl ? String(raw.bankSlipUrl) : undefined,
    }
  }

  async createCustomer(input: CreateCustomerInput) {
    const raw = await this.request<Record<string, unknown>>('/customers', {
      method: 'POST',
      body: JSON.stringify({
        name: input.name,
        email: input.email,
        mobilePhone: input.phone ?? undefined,
        cpfCnpj: input.taxId ?? undefined,
        externalReference: input.externalReference,
      }),
    })
    return {
      providerCustomerId: String(raw.id),
      name: String(raw.name ?? input.name),
      email: String(raw.email ?? input.email),
    }
  }

  async createCharge(input: CreateChargeInput): Promise<ProviderCharge> {
    const raw = await this.request<Record<string, unknown>>('/payments', {
      method: 'POST',
      body: JSON.stringify({
        customer: input.providerCustomerId,
        billingType: METHOD_TO_BILLING_TYPE[input.method] ?? 'UNDEFINED',
        value: input.amount,
        dueDate: input.dueDate,
        description: input.description,
        externalReference: input.externalReference,
        split: this.splitPayload(input.split),
        ...(input.cardToken ? { creditCardToken: input.cardToken } : {}),
      }),
    })
    return this.toProviderCharge(raw)
  }

  async createPix(input: Omit<CreateChargeInput, 'method'>): Promise<ProviderPixCharge> {
    const charge = await this.createCharge({ ...input, method: 'PIX' })
    const qr = await this.request<Record<string, unknown>>(
      `/payments/${charge.providerChargeId}/pixQrCode`,
    )
    return {
      ...charge,
      method: 'PIX',
      pix: {
        payload: String(qr.payload ?? ''),
        qrCodeBase64: String(qr.encodedImage ?? ''),
        expiresAt: String(qr.expirationDate ?? ''),
      },
    }
  }

  async createSubscription(input: CreateSubscriptionInput): Promise<ProviderSubscription> {
    const raw = await this.request<Record<string, unknown>>('/subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        customer: input.providerCustomerId,
        billingType: METHOD_TO_BILLING_TYPE[input.method] ?? 'UNDEFINED',
        value: input.amount,
        nextDueDate: input.nextDueDate,
        cycle: input.cycle,
        description: input.description,
        externalReference: input.externalReference,
        split: this.splitPayload(input.split),
      }),
    })
    return {
      providerSubscriptionId: String(raw.id),
      status: String(raw.status) === 'ACTIVE' ? 'ACTIVE' : 'PAST_DUE',
      nextDueDate: String(raw.nextDueDate ?? input.nextDueDate),
    }
  }

  async cancelCharge(providerChargeId: string) {
    await this.request(`/payments/${providerChargeId}`, { method: 'DELETE' })
  }

  async refundCharge(providerChargeId: string, amount?: number) {
    await this.request(`/payments/${providerChargeId}/refund`, {
      method: 'POST',
      body: JSON.stringify(amount ? { value: amount } : {}),
    })
  }

  async getPayment(providerChargeId: string): Promise<ProviderCharge> {
    const raw = await this.request<Record<string, unknown>>(`/payments/${providerChargeId}`)
    return this.toProviderCharge(raw)
  }

  async createPaymentAccount(input: {
    organizationId: string
    legalName: string
    email: string
    taxId: string
  }): Promise<ProviderPaymentAccount> {
    const raw = await this.request<Record<string, unknown>>('/accounts', {
      method: 'POST',
      body: JSON.stringify({
        name: input.legalName,
        email: input.email,
        cpfCnpj: input.taxId,
        externalReference: input.organizationId,
      }),
    })
    return {
      // `walletId` é a referência usada no split — é o que persistimos.
      providerAccountId: String(raw.walletId ?? raw.id),
      status: 'PENDING',
      onboardingUrl: raw.onboardingUrl ? String(raw.onboardingUrl) : undefined,
      // Vem só nesta resposta. Descartar aqui deixa a academia sem como cobrar.
      apiKey: raw.apiKey ? String(raw.apiKey) : undefined,
    }
  }

  async configureSplit(providerChargeId: string, split: SplitConfiguration) {
    await this.request(`/payments/${providerChargeId}`, {
      method: 'PUT',
      body: JSON.stringify({ split: this.splitPayload(split) }),
    })
  }

  async verifyWebhook(input: {
    headers: Record<string, string>
    rawBody: string
  }): Promise<WebhookVerification> {
    const expected = env(process.env.ASAAS_WEBHOOK_TOKEN, '')
    const received = input.headers['asaas-access-token'] ?? ''

    // Sem token configurado o webhook é rejeitado — nunca aceitar por omissão.
    if (!expected || !timingSafeEqual(expected, received)) {
      return { valid: false, eventId: '', eventType: '' }
    }

    const body = JSON.parse(input.rawBody) as {
      id?: string
      event?: string
      payment?: Record<string, unknown>
    }
    const payment = body.payment ?? {}
    const eventType = String(body.event ?? '')
    const rawStatus = String(payment.status ?? '')

    return {
      valid: true,
      eventId: String(body.id ?? `${eventType}:${payment.id ?? ''}`),
      eventType,
      providerChargeId: payment.id ? String(payment.id) : undefined,
      providerPaymentId: payment.id ? String(payment.id) : undefined,
      status: PAID_EVENTS.has(eventType) ? 'PAID' : (ASAAS_STATUS_MAP[rawStatus] ?? 'PENDING'),
      paidAt: payment.paymentDate ? String(payment.paymentDate) : undefined,
      netAmount: payment.netValue != null ? Number(payment.netValue) : undefined,
      method: payment.billingType ? (String(payment.billingType) as PaymentMethod) : undefined,
    }
  }
}

/**
 * Resumo do erro do Asaas, sem o corpo cru.
 *
 * A resposta traz `errors[].code` e `errors[].description`; a descrição cita
 * dado do pagador ("CPF do pagador inválido: 123..."), então só o código sobe.
 * É o suficiente para saber o que corrigir e nada além disso.
 */
function descreverErro(corpo: string): string {
  try {
    const parsed = JSON.parse(corpo) as { errors?: Array<{ code?: string }> }
    const codigos = (parsed.errors ?? []).map((e) => e.code).filter(Boolean)
    return codigos.length ? ` (${codigos.join(', ')})` : ''
  } catch {
    return ''
  }
}

/** Comparação de tempo constante — evita oráculo de timing no token do webhook. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
