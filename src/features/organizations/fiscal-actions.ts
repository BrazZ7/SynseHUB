'use server'

import { revalidatePath } from 'next/cache'

import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { AppError, toUserMessage } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { requirePermission } from '@/lib/permissions/guard'
import { fiscalDataSchema } from '@/lib/validations/organization'

export type FiscalActionState = {
  status: 'idle' | 'success' | 'error'
  message?: string
  fieldErrors?: Record<string, string[]>
}

/**
 * Salva os dados fiscais da academia.
 *
 * É o documento gravado aqui que abre a subconta no provedor de pagamento. Sem
 * ele o Synse Pay recusa conectar — e, antes desta tela existir, a recusa
 * apontava para um lugar onde não havia campo nenhum para preencher.
 */
export async function updateFiscalDataAction(
  _state: FiscalActionState,
  formData: FormData,
): Promise<FiscalActionState> {
  const session = await requireHubSession()

  try {
    requirePermission(session, 'settings:write')

    const campos = [
      'legalName',
      'taxId',
      'companyType',
      'postalCode',
      'address',
      'addressNumber',
      'district',
      'city',
      'state',
      'phone',
      'monthlyRevenue',
    ] as const

    const parsed = fiscalDataSchema.safeParse(
      Object.fromEntries(campos.map((campo) => [campo, formData.get(campo) ?? ''])),
    )

    if (!parsed.success) {
      return {
        status: 'error',
        message: 'Revise os campos destacados.',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      }
    }

    const dataSource = await getDataSource()
    await dataSource.updateFiscalData({
      organizationId: session.organizationId,
      legalName: parsed.data.legalName || null,
      taxId: parsed.data.taxId || null,
      companyType: parsed.data.companyType || null,
      postalCode: parsed.data.postalCode || null,
      address: parsed.data.address || null,
      addressNumber: parsed.data.addressNumber || null,
      district: parsed.data.district || null,
      city: parsed.data.city || null,
      state: parsed.data.state || null,
      phone: parsed.data.phone || null,
      monthlyRevenue: parsed.data.monthlyRevenue ? Number(parsed.data.monthlyRevenue) : null,
    })

    /*
     * O documento é dado pessoal quando a academia é pessoa física, e o logger
     * já trata `taxId` como valor que nunca aparece em log. Aqui registramos
     * apenas que houve alteração, e por quem.
     */
    logger.info('organizations:fiscal_data_updated', {
      organizationId: session.organizationId,
      actorId: session.userProfileId,
      documentoInformado: Boolean(parsed.data.taxId),
    })

    revalidatePath('/settings')
    revalidatePath('/synse-pay')

    return { status: 'success', message: 'Dados fiscais atualizados.' }
  } catch (error) {
    if (!(error instanceof AppError)) {
      logger.error('organizations:fiscal_update_failed', { error: String(error) })
    }
    return { status: 'error', message: toUserMessage(error) }
  }
}
