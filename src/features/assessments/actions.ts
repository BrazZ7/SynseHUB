'use server'

import { revalidatePath } from 'next/cache'

import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { AppError, toUserMessage } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { requirePermission } from '@/lib/permissions/guard'
import { saveAssessmentSchema } from '@/lib/validations/assessment'
import type { AssessmentActionState } from '@/features/assessments/state'

/**
 * Quem assinou a avaliação.
 *
 * Mesma ideia do treino: `assessed_by_staff_id` aponta para a ficha na
 * academia, não para a conta. Avaliação física é documento com responsável —
 * se o avaliador não tem ficha, fica nulo, que é melhor do que atribuir a
 * medida a outra pessoa.
 */
async function staffIdDaSessao(organizationId: string, userProfileId: string) {
  const dataSource = await getDataSource()
  const staff = await dataSource.listStaff(organizationId)
  return staff.find((member) => member.userProfileId === userProfileId)?.id ?? null
}

/**
 * Grava a avaliação física — cria quando não vem `assessmentId`, corrige quando vem.
 *
 * Ordem obrigatória: sessão → permissão → validação → o aluno é desta academia
 * → escrita. IMC, densidade e percentual pelas dobras não são enviados: quem
 * calcula é o gatilho da 0023, no banco. Número de composição corporal vindo do
 * formulário seria número que o avaliador pode contradizer sem querer.
 */
export async function saveAssessmentAction(
  _state: AssessmentActionState,
  formData: FormData,
): Promise<AssessmentActionState> {
  const session = await requireHubSession()

  try {
    requirePermission(session, 'assessments:write')

    const studentId = String(formData.get('studentId') ?? '')
    const assessmentId = String(formData.get('assessmentId') ?? '')

    const parsed = saveAssessmentSchema.safeParse({
      assessedAt: String(formData.get('assessedAt') ?? ''),
      protocol: String(formData.get('protocol') ?? 'MANUAL'),
      protocolSex: String(formData.get('protocolSex') ?? ''),
      ageYears: String(formData.get('ageYears') ?? ''),
      weight: String(formData.get('weight') ?? ''),
      height: String(formData.get('height') ?? ''),
      bodyFatPercentage: String(formData.get('bodyFatPercentage') ?? ''),
      chest: String(formData.get('chest') ?? ''),
      arm: String(formData.get('arm') ?? ''),
      waist: String(formData.get('waist') ?? ''),
      abdomen: String(formData.get('abdomen') ?? ''),
      hip: String(formData.get('hip') ?? ''),
      thigh: String(formData.get('thigh') ?? ''),
      calf: String(formData.get('calf') ?? ''),
      skinfoldChest: String(formData.get('skinfoldChest') ?? ''),
      skinfoldAxilla: String(formData.get('skinfoldAxilla') ?? ''),
      skinfoldTriceps: String(formData.get('skinfoldTriceps') ?? ''),
      skinfoldSubscapular: String(formData.get('skinfoldSubscapular') ?? ''),
      skinfoldAbdominal: String(formData.get('skinfoldAbdominal') ?? ''),
      skinfoldSuprailiac: String(formData.get('skinfoldSuprailiac') ?? ''),
      skinfoldThigh: String(formData.get('skinfoldThigh') ?? ''),
      notes: String(formData.get('notes') ?? ''),
    })

    if (!parsed.success) {
      const campos = parsed.error.flatten().fieldErrors as Record<string, string[]>
      return {
        status: 'error',
        message: parsed.error.issues[0]?.message ?? 'Revise os campos destacados.',
        fieldErrors: campos,
      }
    }

    const dataSource = await getDataSource()

    /*
     * O aluno precisa ser desta academia. A RLS barraria a escrita de qualquer
     * jeito, mas o erro chegaria como falha genérica em vez de dizer o que
     * aconteceu — e um id colado no formulário merece resposta clara.
     */
    const student = await dataSource.getStudent(session.organizationId, studentId)
    if (!student) return { status: 'error', message: 'Aluno não encontrado nesta academia.' }

    if (assessmentId) {
      const existente = await dataSource.getAssessment(session.organizationId, assessmentId)
      if (!existente || existente.studentId !== studentId) {
        return { status: 'error', message: 'Avaliação não encontrada para este aluno.' }
      }
    }

    const dados = parsed.data
    const salva = await dataSource.saveAssessment({
      id: assessmentId || undefined,
      organizationId: session.organizationId,
      studentId,
      assessedByStaffId: await staffIdDaSessao(session.organizationId, session.userProfileId),
      assessedAt: dados.assessedAt,
      weight: dados.weight,
      height: dados.height,
      chest: dados.chest,
      arm: dados.arm,
      waist: dados.waist,
      abdomen: dados.abdomen,
      hip: dados.hip,
      thigh: dados.thigh,
      calf: dados.calf,
      notes: dados.notes || null,
      protocol: dados.protocol,
      protocolSex: dados.protocolSex,
      ageYears: dados.ageYears,
      bodyFatPercentage: dados.bodyFatPercentage,
      skinfoldChest: dados.skinfoldChest,
      skinfoldAxilla: dados.skinfoldAxilla,
      skinfoldTriceps: dados.skinfoldTriceps,
      skinfoldSubscapular: dados.skinfoldSubscapular,
      skinfoldAbdominal: dados.skinfoldAbdominal,
      skinfoldSuprailiac: dados.skinfoldSuprailiac,
      skinfoldThigh: dados.skinfoldThigh,
    })

    logger.info(assessmentId ? 'assessments:updated' : 'assessments:created', {
      organizationId: session.organizationId,
      assessmentId: salva.id,
      studentId,
      protocol: salva.protocol,
      actorId: session.userProfileId,
    })

    revalidatePath('/assessments')
    revalidatePath(`/students/${studentId}`)
    revalidatePath(`/students/${studentId}/assessments/${salva.id}`)

    const composicao =
      salva.bodyFatPercentage != null ? ` Gordura corporal: ${salva.bodyFatPercentage}%.` : ''

    return {
      status: 'success',
      message: `${assessmentId ? 'Avaliação corrigida' : 'Avaliação registrada'}.${composicao}`,
      savedId: salva.id,
    }
  } catch (error) {
    if (!(error instanceof AppError)) {
      logger.error('assessments:save_failed', { error: String(error) })
    }
    return { status: 'error', message: toUserMessage(error) }
  }
}
