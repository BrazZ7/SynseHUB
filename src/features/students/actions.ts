'use server'

import { revalidatePath } from 'next/cache'

import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { AppError, toUserMessage } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { requirePermission } from '@/lib/permissions/guard'
import { createStudentSchema } from '@/lib/validations/student'
import type { ActionState } from '@/features/students/state'

/**
 * Cadastro de aluno.
 *
 * Ordem obrigatória: sessão → permissão → validação → escrita. A permissão é
 * conferida no servidor mesmo que o botão só apareça para quem pode.
 */
export async function createStudentAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireHubSession()

  try {
    requirePermission(session, 'students:write')

    const parsed = createStudentSchema.safeParse({
      name: formData.get('name'),
      email: formData.get('email'),
      phone: formData.get('phone') ?? '',
      taxId: formData.get('taxId') ?? '',
      goal: formData.get('goal') ?? '',
      planId: formData.get('planId') ?? '',
      trainerId: formData.get('trainerId') ?? '',
      billingDay: formData.get('billingDay') ?? 5,
    })

    if (!parsed.success) {
      return {
        status: 'error',
        message: 'Revise os campos destacados.',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      }
    }

    const dataSource = await getDataSource()
    const student = await dataSource.createStudent({
      organizationId: session.organizationId,
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone || null,
      taxId: parsed.data.taxId || null,
      goal: parsed.data.goal || null,
      planId: parsed.data.planId || null,
      trainerId: parsed.data.trainerId || null,
      billingDay: parsed.data.billingDay,
    })

    logger.info('students:created', {
      organizationId: session.organizationId,
      studentId: student.id,
      actorId: session.userProfileId,
    })

    revalidatePath('/students')
    revalidatePath('/dashboard')

    return {
      status: 'success',
      message: `${student.name} foi matriculado com o Synse ID ${student.synseId}.`,
      createdId: student.id,
    }
  } catch (error) {
    if (!(error instanceof AppError)) {
      logger.error('students:create_failed', { error: String(error) })
    }
    return { status: 'error', message: toUserMessage(error) }
  }
}

/**
 * Confirma a matrícula de quem entrou pelo código de convite.
 *
 * A matrícula nasce pendente justamente para existir este passo: quem entra
 * pelo código ainda não é aluno da academia até que alguém de lá diga que é.
 * Sem a confirmação, qualquer pessoa com o código entraria na contagem de
 * mensalidades e nos relatórios.
 */
export async function confirmStudentAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireHubSession()

  try {
    requirePermission(session, 'students:write')

    const studentId = formData.get('studentId')?.toString().trim()
    if (!studentId) return { status: 'error', message: 'Matrícula inválida.' }

    const dataSource = await getDataSource()
    await dataSource.updateStudentStatus({
      organizationId: session.organizationId,
      studentId,
      status: 'ACTIVE',
    })

    logger.info('students:confirmed', {
      organizationId: session.organizationId,
      studentId,
      actorId: session.userProfileId,
    })

    revalidatePath('/students')
    revalidatePath('/dashboard')

    return { status: 'success', message: 'Matrícula confirmada.' }
  } catch (error) {
    return { status: 'error', message: toUserMessage(error) }
  }
}
