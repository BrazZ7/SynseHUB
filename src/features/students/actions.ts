'use server'

import { revalidatePath } from 'next/cache'

import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { AppError, toUserMessage } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { requirePermission } from '@/lib/permissions/guard'
import {
  createStudentSchema,
  studentStatusChangeSchema,
  updateStudentSchema,
} from '@/lib/validations/student'
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

/**
 * Correção de cadastro de um aluno já matriculado.
 *
 * O e-mail não está aqui: é a identidade da conta, que pertence à pessoa e vale
 * em todas as academias. Trocá-lo pelo painel de uma delas renomearia o login
 * de alguém a partir de fora — e a pessoa descobriria na próxima vez que
 * tentasse entrar.
 */
export async function updateStudentAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireHubSession()

  try {
    requirePermission(session, 'students:write')

    const studentId = String(formData.get('studentId') ?? '')
    if (!studentId) return { status: 'error', message: 'Aluno não informado.' }

    const parsed = updateStudentSchema.safeParse({
      name: formData.get('name'),
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
    await dataSource.updateStudent({
      organizationId: session.organizationId,
      studentId,
      name: parsed.data.name,
      phone: parsed.data.phone || null,
      taxId: parsed.data.taxId || null,
      goal: parsed.data.goal || null,
      trainerId: parsed.data.trainerId || null,
      planId: parsed.data.planId || null,
      billingDay: parsed.data.billingDay,
    })

    logger.info('students:updated', {
      organizationId: session.organizationId,
      studentId,
      actorId: session.userProfileId,
    })

    revalidatePath(`/students/${studentId}`)
    revalidatePath('/students')

    return { status: 'success', message: 'Cadastro atualizado.', createdId: studentId }
  } catch (error) {
    if (!(error instanceof AppError)) {
      logger.error('students:update_failed', { error: String(error) })
    }
    return { status: 'error', message: toUserMessage(error) }
  }
}

/**
 * Encerrar, suspender ou reativar a matrícula.
 *
 * Encerrar não apaga o aluno. O histórico dele — presenças, treinos, cobranças
 * — é registro da academia e continua valendo depois da saída, inclusive para
 * o que a lei exige guardar. E a conta pessoal, com o Synse ID, é da pessoa e
 * segue existindo mesmo sem vínculo nenhum.
 */
export async function changeStudentStatusAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireHubSession()

  try {
    requirePermission(session, 'students:write')

    const studentId = String(formData.get('studentId') ?? '')
    if (!studentId) return { status: 'error', message: 'Aluno não informado.' }

    const parsed = studentStatusChangeSchema.safeParse({ status: formData.get('status') })
    if (!parsed.success) return { status: 'error', message: 'Situação inválida.' }

    const dataSource = await getDataSource()

    /*
     * A leitura antes da escrita não é zelo excessivo: `updateStudentStatus`
     * filtra por organização, então um id de outra academia não mudaria nada —
     * e a tela diria "pronto" sobre uma operação que não aconteceu.
     */
    const aluno = await dataSource.getStudent(session.organizationId, studentId)
    if (!aluno) return { status: 'error', message: 'Aluno não encontrado nesta academia.' }

    await dataSource.updateStudentStatus({
      organizationId: session.organizationId,
      studentId,
      status: parsed.data.status,
    })

    logger.info('students:status_changed', {
      organizationId: session.organizationId,
      studentId,
      status: parsed.data.status,
      actorId: session.userProfileId,
    })

    revalidatePath(`/students/${studentId}`)
    revalidatePath('/students')
    revalidatePath('/dashboard')

    const mensagem = {
      ACTIVE: `${aluno.name} está ativo de novo.`,
      INACTIVE: `${aluno.name} ficou suspenso. O histórico continua aqui.`,
      CANCELLED: `A matrícula de ${aluno.name} foi encerrada. O histórico continua aqui.`,
    }[parsed.data.status]

    return { status: 'success', message: mensagem }
  } catch (error) {
    if (!(error instanceof AppError)) {
      logger.error('students:status_change_failed', { error: String(error) })
    }
    return { status: 'error', message: toUserMessage(error) }
  }
}
