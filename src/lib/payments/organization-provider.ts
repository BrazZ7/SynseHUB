import 'server-only'

import { createSupabaseAdminClient } from '@/lib/database/supabase-admin'
import { AppError } from '@/lib/errors'
import { getPaymentProvider, isSimulatedProvider } from '@/lib/payments'
import { AsaasPaymentProvider } from '@/lib/payments/providers/asaas'
import type { PaymentProvider, SplitConfiguration } from '@/lib/payments/provider'
import { env } from '@/lib/env'

/**
 * Provedor de pagamento na perspectiva de uma academia.
 *
 * O Synse Pay é marketplace: cada academia tem subconta própria no provedor, a
 * mensalidade cai direto na conta dela e o split desvia a comissão para a
 * carteira Synse. Nenhum centavo passa pela plataforma.
 *
 * Na prática isso significa que a chave usada para emitir a cobrança depende de
 * qual academia está cobrando — não é uma credencial global. Este módulo
 * resolve qual usar.
 */

export const paymentAccountMissing = () =>
  new AppError(
    'payment_account_missing',
    'O Synse Pay ainda não está conectado nesta academia. Conclua a configuração em Configurações → Synse Pay.',
    409,
    'sem subconta ativa no provedor',
  )

export const platformWalletMissing = () =>
  new AppError(
    'platform_wallet_missing',
    'A cobrança está indisponível no momento.',
    500,
    'SYNSE_PLATFORM_WALLET_ID não configurada',
  )

/**
 * Cliente do provedor autenticado como a academia.
 *
 * Em modo simulado devolve o provedor global — não há subconta a resolver, e
 * exigir uma impediria a demonstração de funcionar.
 */
export async function getProviderForOrganization(organizationId: string): Promise<PaymentProvider> {
  if (isSimulatedProvider()) return getPaymentProvider()

  const admin = createSupabaseAdminClient()
  if (!admin) throw paymentAccountMissing()

  /*
   * Leitura pelo service role de propósito: `payment_account_secrets` não tem
   * política de RLS e o GRANT está revogado, então nenhuma consulta
   * autenticada alcança a chave — nem a da dona da academia.
   */
  const { data, error } = await admin
    .from('payment_account_secrets')
    .select('api_key')
    .eq('organization_id', organizationId)
    .eq('provider', 'asaas')
    .maybeSingle()

  if (error) throw paymentAccountMissing()
  if (!data?.api_key) throw paymentAccountMissing()

  return new AsaasPaymentProvider({ apiKey: data.api_key })
}

/**
 * Split a aplicar nas cobranças desta academia.
 *
 * O percentual vem do banco — nunca do código. `SYNSE_PLATFORM_WALLET_ID` é a
 * carteira que recebe a comissão; sem ela a cobrança sairia inteira para a
 * academia e a comissão simplesmente não existiria, sem erro nenhum na tela.
 * Por isso a ausência é falha, não omissão silenciosa.
 */
export async function getSplitForOrganization(
  organizationId: string,
): Promise<SplitConfiguration | undefined> {
  if (isSimulatedProvider()) return undefined

  const walletId = env(process.env.SYNSE_PLATFORM_WALLET_ID, '')
  if (!walletId) throw platformWalletMissing()

  const admin = createSupabaseAdminClient()
  if (!admin) throw platformWalletMissing()

  const { data } = await admin
    .from('organization_billing_settings')
    .select('platform_fee_percentage, platform_fixed_fee')
    .eq('organization_id', organizationId)
    .maybeSingle()

  return {
    providerAccountId: walletId,
    platformPercentage: Number(data?.platform_fee_percentage ?? 2),
    platformFixedFee: Number(data?.platform_fixed_fee ?? 0),
  }
}
