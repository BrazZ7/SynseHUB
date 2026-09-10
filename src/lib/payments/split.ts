import { roundMoney } from '@/lib/utils'
import type { OrganizationBillingSettings } from '@/types/domain'

/**
 * Cálculo do split Synse × academia.
 *
 * O percentual NUNCA é constante no código: vem de
 * `organization_billing_settings`. Este módulo apenas aplica a regra e garante
 * que a soma bata exatamente com o valor cobrado (sem centavo perdido).
 */

export type SplitResult = {
  grossAmount: number
  platformAmount: number
  organizationAmount: number
  providerFee: number
  platformPercentage: number
}

export function calculateSplit(
  grossAmount: number,
  settings: Pick<
    OrganizationBillingSettings,
    'platformFeePercentage' | 'platformFixedFee' | 'paymentProviderFeeStrategy'
  >,
  providerFee = 0,
): SplitResult {
  const percentageAmount = (grossAmount * settings.platformFeePercentage) / 100
  let platformAmount = roundMoney(percentageAmount + settings.platformFixedFee)

  // Quem absorve a tarifa do provedor.
  let organizationAmount: number
  switch (settings.paymentProviderFeeStrategy) {
    case 'PLATFORM_ABSORBS':
      platformAmount = roundMoney(platformAmount - providerFee)
      organizationAmount = roundMoney(grossAmount - platformAmount - providerFee)
      break
    case 'CUSTOMER_ABSORBS':
      // A tarifa já foi somada ao valor cobrado do aluno.
      organizationAmount = roundMoney(grossAmount - platformAmount)
      break
    case 'ORGANIZATION_ABSORBS':
    default:
      organizationAmount = roundMoney(grossAmount - platformAmount - providerFee)
      break
  }

  // Trava de segurança: a academia nunca recebe valor negativo.
  if (organizationAmount < 0) {
    organizationAmount = 0
    platformAmount = roundMoney(Math.max(0, grossAmount - providerFee))
  }

  return {
    grossAmount: roundMoney(grossAmount),
    platformAmount,
    organizationAmount,
    providerFee: roundMoney(providerFee),
    platformPercentage: settings.platformFeePercentage,
  }
}

export const DEFAULT_BILLING_SETTINGS: Omit<OrganizationBillingSettings, 'organizationId'> = {
  platformFeePercentage: Number(process.env.SYNSE_DEFAULT_PLATFORM_FEE_PERCENTAGE ?? 2),
  platformFixedFee: Number(process.env.SYNSE_DEFAULT_PLATFORM_FIXED_FEE ?? 0),
  paymentProviderFeeStrategy: 'ORGANIZATION_ABSORBS',
}
