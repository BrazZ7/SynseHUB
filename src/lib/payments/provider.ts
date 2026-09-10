/**
 * Contrato do provedor de pagamentos do Synse Pay.
 *
 * Nenhum código específico de gateway pode vazar para fora de
 * `src/lib/payments/providers/*`. Services, actions e UI conhecem apenas esta
 * interface — é o que permite trocar Asaas por Mercado Pago, Stripe ou Pagar.me
 * sem tocar em regra de negócio.
 *
 * Dados completos de cartão NUNCA transitam por aqui: o adapter recebe apenas
 * um token gerado pelo SDK do provedor no cliente.
 */

import type { PaymentMethod } from '@/types/domain'

export type ProviderCustomer = {
  providerCustomerId: string
  name: string
  email: string
}

export type ProviderCharge = {
  providerChargeId: string
  status: 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED' | 'REFUNDED' | 'FAILED'
  amount: number
  dueDate: string
  method: PaymentMethod
  /** Link hospedado pelo provedor para o pagador. */
  invoiceUrl?: string
  bankSlipUrl?: string
}

export type ProviderPixCharge = ProviderCharge & {
  pix: {
    /** Payload "copia e cola" (BR Code). */
    payload: string
    /** QR Code em base64, sem o prefixo `data:`. */
    qrCodeBase64: string
    expiresAt: string
  }
}

export type ProviderSubscription = {
  providerSubscriptionId: string
  status: 'ACTIVE' | 'PAST_DUE' | 'CANCELLED'
  nextDueDate: string
}

export type ProviderPaymentAccount = {
  providerAccountId: string
  status: 'PENDING' | 'ACTIVE' | 'BLOCKED'
  onboardingUrl?: string
}

export type SplitConfiguration = {
  providerAccountId: string
  /** Percentual destinado à plataforma Synse. */
  platformPercentage: number
  platformFixedFee: number
}

export type CreateCustomerInput = {
  name: string
  email: string
  phone?: string | null
  taxId?: string | null
  externalReference: string
}

export type CreateChargeInput = {
  providerCustomerId: string
  amount: number
  dueDate: string
  description: string
  method: Exclude<PaymentMethod, 'CASH'>
  externalReference: string
  split?: SplitConfiguration
  /** Token de cartão gerado no cliente. O PAN nunca chega ao nosso servidor. */
  cardToken?: string
}

export type CreateSubscriptionInput = Omit<CreateChargeInput, 'dueDate'> & {
  cycle: 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL'
  nextDueDate: string
}

export type WebhookVerification = {
  valid: boolean
  eventId: string
  eventType: string
  /** Referência da cobrança no provedor, quando aplicável. */
  providerChargeId?: string
  providerPaymentId?: string
  status?: ProviderCharge['status']
  paidAt?: string
  netAmount?: number
  method?: PaymentMethod
}

export interface PaymentProvider {
  readonly id: string
  /** Métodos que este provedor realmente suporta — a UI só mostra estes. */
  readonly supportedMethods: PaymentMethod[]

  createCustomer(input: CreateCustomerInput): Promise<ProviderCustomer>
  createCharge(input: CreateChargeInput): Promise<ProviderCharge>
  createPix(input: Omit<CreateChargeInput, 'method'>): Promise<ProviderPixCharge>
  createSubscription(input: CreateSubscriptionInput): Promise<ProviderSubscription>
  cancelCharge(providerChargeId: string): Promise<void>
  refundCharge(providerChargeId: string, amount?: number): Promise<void>
  getPayment(providerChargeId: string): Promise<ProviderCharge>

  createPaymentAccount(input: {
    organizationId: string
    legalName: string
    email: string
    taxId: string
  }): Promise<ProviderPaymentAccount>

  configureSplit(providerChargeId: string, split: SplitConfiguration): Promise<void>

  /** Valida assinatura/token do webhook e normaliza o evento. */
  verifyWebhook(input: {
    headers: Record<string, string>
    rawBody: string
  }): Promise<WebhookVerification>
}
