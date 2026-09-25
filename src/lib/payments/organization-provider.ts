import 'server-only'

import { APP } from '@/config/app'
import { createSupabaseAdminClient } from '@/lib/database/supabase-admin'
import { AppError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { getPaymentProvider, isSimulatedProvider } from '@/lib/payments'
import type { PaymentProvider, SplitConfiguration } from '@/lib/payments/provider'
import { env } from '@/lib/env'

/**
 * ── Provedor de pagamento na perspectiva de uma academia ─────────────────────
 *
 * O Synse Pay é marketplace: cada academia tem subconta própria no provedor, a
 * mensalidade cai direto na conta dela e o split desvia a comissão para a
 * carteira Synse. Nenhum centavo passa pela plataforma. Na prática isso
 * significa que a chave usada para emitir a cobrança depende de qual academia
 * está cobrando — não é uma credencial global.
 *
 * ── O que saiu daqui e o que ficou ──────────────────────────────────────────
 *
 * O Asaas saiu por causa da taxa, e o substituto ainda não foi escolhido. Saiu
 * junto **só o que dependia de conhecer o gateway**: montar o cliente da
 * subconta exige uma classe concreta, e não dá para escrever essa linha sem
 * saber qual é.
 *
 * O resto ficou, e de propósito. A carteira da plataforma e o percentual do
 * banco são regra do marketplace, não do Asaas, e valem igual para quem vier.
 * Apagá-las junto entregaria ao próximo provedor um caminho sem a tranca que
 * existe justamente porque a falta dela não dá erro nenhum na tela.
 */

export const cobrancaDesligada = () =>
  new AppError(
    'payment_provider_missing',
    'A cobrança automática está desligada enquanto escolhemos o novo provedor de pagamento.',
    503,
    'nenhum provedor real configurado — só o simulado',
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
 *
 * Fora dele não há provedor nenhum hoje, e o erro diz isso em vez de deixar a
 * tela achar que emitiu. Quem for ligar o próximo adapter volta a escrever
 * aqui, e precisa de duas coisas que a versão do Asaas já tinha resolvido:
 *
 * 1. **A chave da subconta é lida pelo service role.**
 *    `payment_account_secrets` não tem política de RLS e o GRANT está
 *    revogado, então nenhuma consulta autenticada alcança a chave — nem a da
 *    dona da academia.
 *
 * 2. **O filtro por `provider` na consulta vem do `id` do adapter**, não
 *    escrito à mão. A versão do Asaas tinha `'asaas'` fixo na cláusula, que
 *    era exatamente a regra da casa — código de gateway só dentro do adapter —
 *    sendo quebrada fora dele.
 */
export async function getProviderForOrganization(
  _organizationId: string,
): Promise<PaymentProvider> {
  if (isSimulatedProvider()) return getPaymentProvider()
  throw cobrancaDesligada()
}

/**
 * Split a aplicar nas cobranças desta academia.
 *
 * O percentual vem do banco — nunca do código. `SYNSE_PLATFORM_WALLET_ID` é a
 * carteira que recebe a comissão.
 *
 * Sem ela, a cobrança sai inteira para a academia e a comissão simplesmente não
 * existe — sem erro nenhum na tela, enquanto o painel segue exibindo os 2% como
 * se tivessem sido retidos. Em produção isso é dinheiro perdido em silêncio,
 * então a emissão para.
 *
 * Fora de produção ela apenas avisa e segue. Exigir a carteira no ambiente de
 * desenvolvimento obrigaria a abrir uma segunda conta no provedor antes de
 * conseguir testar qualquer outra parte do fluxo — e travar o teste do que
 * funciona para proteger o que ainda não existe é proteção no lugar errado.
 */
export async function getSplitForOrganization(
  organizationId: string,
): Promise<SplitConfiguration | undefined> {
  if (isSimulatedProvider()) return undefined

  const walletId = env(process.env.SYNSE_PLATFORM_WALLET_ID, '')
  if (!walletId) {
    if (APP.env === 'production') throw platformWalletMissing()

    logger.warn('payments:split_ignorado', {
      organizationId,
      motivo: 'SYNSE_PLATFORM_WALLET_ID ausente — cobrança sai sem comissão',
    })
    return undefined
  }

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
