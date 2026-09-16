'use server'

import { revalidatePath } from 'next/cache'

import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { AppError, toUserMessage } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { requirePermission } from '@/lib/permissions/guard'
import {
  convertLeadSchema,
  leadNoteSchema,
  moveStageSchema,
  saveLeadSchema,
} from '@/lib/validations/lead'
import type { CrmActionState } from '@/features/crm/state'

/** Quem está operando o CRM, como ficha da academia. */
async function staffIdDaSessao(organizationId: string, userProfileId: string) {
  const dataSource = await getDataSource()
  const staff = await dataSource.listStaff(organizationId)
  return staff.find((member) => member.userProfileId === userProfileId)?.id ?? null
}

const erro = (parsed: {
  error: { issues: { message: string }[]; flatten: () => { fieldErrors: unknown } }
}) => ({
  status: 'error' as const,
  message: parsed.error.issues[0]?.message ?? 'Revise os campos destacados.',
  fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
})

export async function saveLeadAction(
  _state: CrmActionState,
  formData: FormData,
): Promise<CrmActionState> {
  const session = await requireHubSession()

  try {
    requirePermission(session, 'crm:write')

    const parsed = saveLeadSchema.safeParse({
      name: formData.get('name') ?? '',
      phone: formData.get('phone') ?? '',
      email: formData.get('email') ?? '',
      source: formData.get('source') ?? 'OTHER',
      ownerStaffId: formData.get('ownerStaffId') ?? '',
      notes: formData.get('notes') ?? '',
      nextFollowUpAt: formData.get('nextFollowUpAt') ?? '',
    })
    if (!parsed.success) return erro(parsed)

    const leadId = String(formData.get('leadId') ?? '')
    const dataSource = await getDataSource()

    if (leadId) {
      const existente = await dataSource.getLead(session.organizationId, leadId)
      if (!existente) return { status: 'error', message: 'Lead não encontrado nesta academia.' }
    }

    const dados = parsed.data
    await dataSource.saveLead({
      id: leadId || undefined,
      organizationId: session.organizationId,
      name: dados.name,
      phone: dados.phone || null,
      email: dados.email || null,
      source: dados.source,
      ownerStaffId: dados.ownerStaffId || null,
      notes: dados.notes || null,
      // Data pura vira instante do fim do dia: retorno marcado para hoje não
      // pode aparecer vencido às nove da manhã.
      nextFollowUpAt: dados.nextFollowUpAt ? `${dados.nextFollowUpAt}T23:59:59` : null,
    })

    revalidatePath('/crm')
    return { status: 'success', message: leadId ? 'Lead atualizado.' : 'Lead cadastrado.' }
  } catch (error) {
    if (!(error instanceof AppError)) logger.error('crm:save_failed', { error: String(error) })
    return { status: 'error', message: toUserMessage(error) }
  }
}

/** Move a etapa. O histórico é do gatilho — aqui só o status muda. */
export async function moveLeadStageAction(
  _state: CrmActionState,
  formData: FormData,
): Promise<CrmActionState> {
  const session = await requireHubSession()

  try {
    requirePermission(session, 'crm:write')

    const parsed = moveStageSchema.safeParse({
      leadId: formData.get('leadId') ?? '',
      stage: formData.get('stage') ?? 'NEW',
      lostReason: formData.get('lostReason') ?? '',
    })
    if (!parsed.success) return erro(parsed)

    const dataSource = await getDataSource()
    const lead = await dataSource.getLead(session.organizationId, parsed.data.leadId)
    if (!lead) return { status: 'error', message: 'Lead não encontrado nesta academia.' }

    /*
     * Matricular é converter, e converter cria aluno e mensalidade. Deixar a
     * etapa chegar em ENROLLED por arrastar o cartão produziria um "matriculado"
     * sem matrícula — número bonito no funil e nada no financeiro.
     */
    if (parsed.data.stage === 'ENROLLED') {
      return {
        status: 'error',
        message: 'Para matricular, use "Converter em aluno" — é ela que cria a matrícula.',
      }
    }

    await dataSource.moveLeadStage(
      session.organizationId,
      parsed.data.leadId,
      parsed.data.stage,
      parsed.data.lostReason || null,
    )

    revalidatePath('/crm')
    return { status: 'success', message: 'Etapa atualizada.' }
  } catch (error) {
    if (!(error instanceof AppError)) logger.error('crm:move_failed', { error: String(error) })
    return { status: 'error', message: toUserMessage(error) }
  }
}

export async function addLeadNoteAction(
  _state: CrmActionState,
  formData: FormData,
): Promise<CrmActionState> {
  const session = await requireHubSession()

  try {
    requirePermission(session, 'crm:write')

    const parsed = leadNoteSchema.safeParse({
      leadId: formData.get('leadId') ?? '',
      kind: formData.get('kind') ?? 'NOTE',
      body: formData.get('body') ?? '',
    })
    if (!parsed.success) return erro(parsed)

    const dataSource = await getDataSource()
    const lead = await dataSource.getLead(session.organizationId, parsed.data.leadId)
    if (!lead) return { status: 'error', message: 'Lead não encontrado nesta academia.' }

    await dataSource.addLeadEvent(
      session.organizationId,
      parsed.data.leadId,
      parsed.data.kind,
      parsed.data.body,
      await staffIdDaSessao(session.organizationId, session.userProfileId),
    )

    revalidatePath('/crm')
    return { status: 'success', message: 'Registrado no histórico.' }
  } catch (error) {
    if (!(error instanceof AppError)) logger.error('crm:note_failed', { error: String(error) })
    return { status: 'error', message: toUserMessage(error) }
  }
}

/** O momento que justifica o módulo: o lead vira aluno matriculado. */
export async function convertLeadAction(
  _state: CrmActionState,
  formData: FormData,
): Promise<CrmActionState> {
  const session = await requireHubSession()

  try {
    requirePermission(session, 'crm:write')
    // Converter cria aluno e mensalidade: exige também quem pode fazer isso.
    requirePermission(session, 'students:write')

    const parsed = convertLeadSchema.safeParse({
      leadId: formData.get('leadId') ?? '',
      planId: formData.get('planId') ?? '',
      billingDay: formData.get('billingDay') ?? '5',
    })
    if (!parsed.success) return erro(parsed)

    const dataSource = await getDataSource()
    const lead = await dataSource.getLead(session.organizationId, parsed.data.leadId)
    if (!lead) return { status: 'error', message: 'Lead não encontrado nesta academia.' }

    const studentId = await dataSource.convertLead(
      parsed.data.leadId,
      parsed.data.planId || null,
      parsed.data.billingDay,
    )

    logger.info('crm:converted', {
      organizationId: session.organizationId,
      leadId: parsed.data.leadId,
      studentId,
      actorId: session.userProfileId,
    })

    revalidatePath('/crm')
    revalidatePath('/students')

    return {
      status: 'success',
      message: `${lead.name} agora é aluno${parsed.data.planId ? ' com mensalidade ativa' : ''}.`,
      studentId,
    }
  } catch (error) {
    if (!(error instanceof AppError)) logger.error('crm:convert_failed', { error: String(error) })
    return { status: 'error', message: toUserMessage(error) }
  }
}
