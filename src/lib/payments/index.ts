import 'server-only'

import { AsaasPaymentProvider } from '@/lib/payments/providers/asaas'
import { MockPaymentProvider } from '@/lib/payments/providers/mock'
import type { PaymentProvider } from '@/lib/payments/provider'
import { env } from '@/lib/env'

/**
 * Fábrica do provedor de pagamentos.
 * O resto da aplicação chama `getPaymentProvider()` e recebe a interface —
 * nunca uma classe concreta.
 */
let cached: PaymentProvider | null = null

export function getPaymentProvider(): PaymentProvider {
  if (cached) return cached

  const configured = env(process.env.PAYMENT_PROVIDER, 'mock').toLowerCase()
  switch (configured) {
    case 'asaas':
      cached = new AsaasPaymentProvider()
      break
    case 'mock':
    default:
      cached = new MockPaymentProvider()
      break
  }
  return cached
}

/** `true` quando nenhum dinheiro real se move — a UI sinaliza isso. */
export function isSimulatedProvider(): boolean {
  return getPaymentProvider().id === 'mock'
}

export type { PaymentProvider } from '@/lib/payments/provider'
