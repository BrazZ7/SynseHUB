import 'server-only'

import { generateSynseId } from '@/lib/synse-id'
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
import { logger } from '@/lib/logger'
import type { PaymentMethod } from '@/types/domain'

/**
 * Provedor de desenvolvimento.
 *
 * NÃO movimenta dinheiro. Existe para que todo o fluxo do Synse Pay —
 * cobrança, PIX, split, conciliação, régua — seja desenvolvido e testado antes
 * de existirem credenciais reais. É selecionado por `PAYMENT_PROVIDER=mock` e
 * a UI sinaliza o modo simulado ao usuário.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly id = 'mock'
  readonly supportedMethods: PaymentMethod[] = ['PIX', 'BOLETO', 'CREDIT_CARD', 'CASH']

  private ref(prefix: string) {
    return `${prefix}_${generateSynseId().replace('SYN-', '').toLowerCase()}`
  }

  async createCustomer(input: CreateCustomerInput) {
    logger.debug('mock:createCustomer', { externalReference: input.externalReference })
    return { providerCustomerId: this.ref('cus'), name: input.name, email: input.email }
  }

  async createCharge(input: CreateChargeInput): Promise<ProviderCharge> {
    return {
      providerChargeId: this.ref('chg'),
      status: 'PENDING',
      amount: input.amount,
      dueDate: input.dueDate,
      method: input.method,
      invoiceUrl: `https://pay.synse.local/mock/${this.ref('inv')}`,
    }
  }

  async createPix(input: Omit<CreateChargeInput, 'method'>): Promise<ProviderPixCharge> {
    const base = await this.createCharge({ ...input, method: 'PIX' })
    const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString()
    // BR Code fictício, com estrutura plausível para exercitar a UI.
    const payload = `00020126580014BR.GOV.BCB.PIX0136${base.providerChargeId}5204000053039865802BR5910SYNSE PAY6009SAO PAULO62070503***6304MOCK`
    return {
      ...base,
      method: 'PIX',
      pix: {
        payload,
        qrCodeBase64: Buffer.from(payload).toString('base64'),
        expiresAt,
      },
    }
  }

  async createSubscription(input: CreateSubscriptionInput): Promise<ProviderSubscription> {
    return {
      providerSubscriptionId: this.ref('sub'),
      status: 'ACTIVE',
      nextDueDate: input.nextDueDate,
    }
  }

  async cancelCharge(providerChargeId: string) {
    logger.debug('mock:cancelCharge', { providerChargeId })
  }

  async refundCharge(providerChargeId: string, amount?: number) {
    logger.debug('mock:refundCharge', { providerChargeId, amount })
  }

  async getPayment(providerChargeId: string): Promise<ProviderCharge> {
    return {
      providerChargeId,
      status: 'PENDING',
      amount: 0,
      dueDate: new Date().toISOString().slice(0, 10),
      method: 'PIX',
    }
  }

  async createPaymentAccount(): Promise<ProviderPaymentAccount> {
    return { providerAccountId: this.ref('acc'), status: 'ACTIVE' }
  }

  async configureSplit(providerChargeId: string, split: SplitConfiguration) {
    logger.debug('mock:configureSplit', { providerChargeId, split })
  }

  async verifyWebhook(input: {
    headers: Record<string, string>
    rawBody: string
  }): Promise<WebhookVerification> {
    const body = JSON.parse(input.rawBody) as Record<string, unknown>
    return {
      valid: true,
      eventId: String(body.id ?? this.ref('evt')),
      eventType: String(body.event ?? 'PAYMENT_RECEIVED'),
      providerChargeId: body.providerChargeId ? String(body.providerChargeId) : undefined,
      status: 'PAID',
      paidAt: new Date().toISOString(),
    }
  }
}
