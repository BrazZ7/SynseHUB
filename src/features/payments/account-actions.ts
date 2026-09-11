'use server'

import { revalidatePath } from 'next/cache'

import { getDataSource } from '@/lib/database'
import { createSupabaseAdminClient } from '@/lib/database/supabase-admin'
import { AppError, toUserMessage } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { getPaymentProvider, isSimulatedProvider } from '@/lib/payments'
import { requirePermission } from '@/lib/permissions/guard'
import { requireHubSession } from '@/lib/auth/require-session'

export type AccountActionState = { status: 'idle' | 'success' | 'error'; message?: string }

/**
 * Conecta a academia ao provedor de pagamento.
 *
 * O Synse Pay é marketplace: a mensalidade cai na conta da academia e o split
 * desvia a comissão. Para isso a academia precisa de subconta própria no
 * provedor, criada aqui a partir da conta da plataforma.
 *
 * A chave devolvida na criação é guardada em `payment_account_secrets`, que não
 * tem política de RLS e está com o GRANT revogado: nem a dona da academia lê a
 * própria credencial pelo painel. Só o servidor a usa, na hora de cobrar.
 */
export async function connectPaymentAccountAction(
  _state: AccountActionState,
  _formData: FormData,
): Promise<AccountActionState> {
  const session = await requireHubSession()

  try {
    requirePermission(session, 'settings:write')

    if (isSimulatedProvider()) {
      return {
        status: 'error',
        message: 'O provedor está em modo simulado. Não há subconta real para criar.',
      }
    }

    const dataSource = await getDataSource()
    const [organization, existing] = await Promise.all([
      dataSource.getOrganization(session.organizationId),
      dataSource.getPaymentAccount(session.organizationId),
    ])

    if (existing?.providerAccountId) {
      return { status: 'success', message: 'Esta academia já está conectada ao Synse Pay.' }
    }
    if (!organization) throw new AppError('not_found', 'Academia não encontrada.', 404)

    /*
     * Sem CNPJ (ou CPF do responsável) o provedor recusa a abertura, e a
     * mensagem dele não diz o que preencher. Barrar aqui aponta o caminho.
     */
    if (!organization.taxId) {
      return {
        status: 'error',
        message: 'Informe o CNPJ da academia em Configurações antes de conectar o Synse Pay.',
      }
    }

    const admin = createSupabaseAdminClient()
    if (!admin) throw new AppError('unavailable', 'Configuração indisponível no momento.', 503)

    const provider = getPaymentProvider()
    const account = await provider.createPaymentAccount({
      organizationId: organization.id,
      legalName: organization.legalName ?? organization.name,
      email: session.email,
      taxId: organization.taxId,
    })

    const { data: row, error } = await admin
      .from('payment_accounts')
      .upsert(
        {
          organization_id: organization.id,
          provider: provider.id,
          provider_account_id: account.providerAccountId,
          status: account.status,
          onboarding_status: 'IN_REVIEW',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'organization_id,provider' },
      )
      .select('id')
      .single()
    if (error) throw error

    /*
     * A credencial vem uma única vez, na resposta da criação. Perder aqui
     * significa subconta aberta e inutilizável: não há como recuperá-la depois,
     * e a academia fica sem como cobrar.
     */
    if (account.apiKey) {
      const { error: secretError } = await admin.from('payment_account_secrets').upsert(
        {
          payment_account_id: row.id,
          organization_id: organization.id,
          provider: provider.id,
          api_key: account.apiKey,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'payment_account_id' },
      )
      if (secretError) throw secretError
    } else {
      logger.error('payments:account_without_key', {
        organizationId: organization.id,
        provider: provider.id,
      })
    }

    // Nunca logar a chave: o logger redige `apiKey`, mas nem chega perto daqui.
    logger.info('payments:account_connected', {
      organizationId: organization.id,
      provider: provider.id,
      providerAccountId: account.providerAccountId,
    })

    revalidatePath('/synse-pay')
    revalidatePath('/settings')

    return {
      status: 'success',
      message: account.apiKey
        ? 'Synse Pay conectado. As próximas cobranças saem pela conta da academia.'
        : 'Subconta criada, mas o provedor não devolveu a credencial. Fale com o suporte antes de cobrar.',
    }
  } catch (error) {
    if (!(error instanceof AppError)) {
      logger.error('payments:account_connect_failed', { error: String(error) })
    }
    return { status: 'error', message: toUserMessage(error) }
  }
}
