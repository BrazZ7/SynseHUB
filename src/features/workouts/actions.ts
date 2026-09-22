'use server'

import { revalidatePath } from 'next/cache'

import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { AppError, toUserMessage } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { requirePermission } from '@/lib/permissions/guard'
import {
  assignWorkoutSchema,
  createWeekSchema,
  createWorkoutSchema,
  updateWorkoutSchema,
} from '@/lib/validations/workout'
import { parseWeekForm, parseWorkoutForm } from '@/features/workouts/form'
import type { WorkoutActionState } from '@/features/workouts/state'

/**
 * Quem assina o treino.
 *
 * `created_by_staff_id` aponta para a ficha na academia, não para a conta —
 * são tabelas diferentes, e quem monta o treino precisa constar como
 * responsável por ele. Sem ficha correspondente fica nulo, que é melhor que
 * apontar para a pessoa errada.
 */
async function staffIdDaSessao(organizationId: string, userProfileId: string) {
  const dataSource = await getDataSource()
  const staff = await dataSource.listStaff(organizationId)
  return staff.find((member) => member.userProfileId === userProfileId)?.id ?? null
}

/**
 * Criação de treino, com os exercícios juntos.
 *
 * Ordem obrigatória: sessão → permissão → validação → escrita.
 */
export async function createWorkoutAction(
  _state: WorkoutActionState,
  formData: FormData,
): Promise<WorkoutActionState> {
  const session = await requireHubSession()

  try {
    requirePermission(session, 'workouts:write')

    const parsed = createWorkoutSchema.safeParse(
      parseWorkoutForm({
        name: String(formData.get('name') ?? ''),
        goal: String(formData.get('goal') ?? ''),
        splitLabel: String(formData.get('splitLabel') ?? ''),
        exerciseId: formData.getAll('exerciseId').map(String),
        sets: formData.getAll('sets').map(String),
        reps: formData.getAll('reps').map(String),
        restSeconds: formData.getAll('restSeconds').map(String),
        suggestedLoad: formData.getAll('suggestedLoad').map(String),
        notes: formData.getAll('notes').map(String),
      }),
    )

    if (!parsed.success) {
      const campos = parsed.error.flatten().fieldErrors as Record<string, string[]>
      return {
        status: 'error',
        // Erro dentro de uma linha da lista não tem onde aparecer no campo, e
        // "Revise os campos destacados" sem destaque nenhum é um beco.
        message: campos.exercises?.[0] ?? 'Revise os campos destacados.',
        fieldErrors: campos,
      }
    }

    const dataSource = await getDataSource()
    const plan = await dataSource.createWorkoutPlan({
      organizationId: session.organizationId,
      name: parsed.data.name,
      goal: parsed.data.goal || null,
      splitLabel: parsed.data.splitLabel,
      createdByStaffId: await staffIdDaSessao(session.organizationId, session.userProfileId),
      exercises: parsed.data.exercises.map((exercicio) => ({
        exerciseId: exercicio.exerciseId,
        sets: exercicio.sets,
        reps: exercicio.reps,
        restSeconds: exercicio.restSeconds,
        suggestedLoad: exercicio.suggestedLoad ?? null,
        notes: exercicio.notes || null,
      })),
    })

    logger.info('workouts:created', {
      organizationId: session.organizationId,
      workoutPlanId: plan.id,
      exercises: parsed.data.exercises.length,
      actorId: session.userProfileId,
    })

    revalidatePath('/workouts')
    revalidatePath('/dashboard')

    return {
      status: 'success',
      message: `Treino ${plan.name} criado com ${parsed.data.exercises.length} exercícios.`,
      createdId: plan.id,
    }
  } catch (error) {
    if (!(error instanceof AppError)) {
      logger.error('workouts:create_failed', { error: String(error) })
    }
    return { status: 'error', message: toUserMessage(error) }
  }
}

/**
 * Edição de treino.
 *
 * Mesma ordem obrigatória da criação: sessão → permissão → validação →
 * escrita. O `planId` vem do formulário, então ele é tão não confiável quanto
 * o resto — quem confere se o treino é desta academia é a camada de banco,
 * pelo `organizationId` que sai da sessão e nunca do formulário.
 */
export async function updateWorkoutAction(
  _state: WorkoutActionState,
  formData: FormData,
): Promise<WorkoutActionState> {
  const session = await requireHubSession()

  try {
    requirePermission(session, 'workouts:write')

    const parsed = updateWorkoutSchema.safeParse({
      planId: String(formData.get('planId') ?? ''),
      ...parseWorkoutForm({
        name: String(formData.get('name') ?? ''),
        goal: String(formData.get('goal') ?? ''),
        splitLabel: String(formData.get('splitLabel') ?? ''),
        exerciseId: formData.getAll('exerciseId').map(String),
        sets: formData.getAll('sets').map(String),
        reps: formData.getAll('reps').map(String),
        restSeconds: formData.getAll('restSeconds').map(String),
        suggestedLoad: formData.getAll('suggestedLoad').map(String),
        notes: formData.getAll('notes').map(String),
      }),
    })

    if (!parsed.success) {
      const campos = parsed.error.flatten().fieldErrors as Record<string, string[]>
      return {
        status: 'error',
        message: campos.exercises?.[0] ?? 'Revise os campos destacados.',
        fieldErrors: campos,
      }
    }

    const dataSource = await getDataSource()
    const plan = await dataSource.updateWorkoutPlan({
      organizationId: session.organizationId,
      planId: parsed.data.planId,
      name: parsed.data.name,
      goal: parsed.data.goal || null,
      splitLabel: parsed.data.splitLabel,
      exercises: parsed.data.exercises.map((exercicio) => ({
        exerciseId: exercicio.exerciseId,
        sets: exercicio.sets,
        reps: exercicio.reps,
        restSeconds: exercicio.restSeconds,
        suggestedLoad: exercicio.suggestedLoad ?? null,
        notes: exercicio.notes || null,
      })),
    })

    logger.info('workouts:updated', {
      organizationId: session.organizationId,
      workoutPlanId: plan.id,
      exercises: parsed.data.exercises.length,
      actorId: session.userProfileId,
    })

    revalidatePath('/workouts')
    revalidatePath(`/workouts/${plan.id}`)

    return {
      status: 'success',
      message: `Treino ${plan.name} atualizado.`,
      createdId: plan.id,
    }
  } catch (error) {
    if (!(error instanceof AppError)) {
      logger.error('workouts:update_failed', { error: String(error) })
    }
    return { status: 'error', message: toUserMessage(error) }
  }
}

/**
 * A semana inteira de uma vez.
 *
 * Cada dia vira um treino separado, como sempre foi. O que muda é o caminho:
 * em vez de abrir o formulário cinco vezes, o professor descreve a semana numa
 * tela e o Synse cria os cinco.
 *
 * ── O que acontece se o terceiro dia falhar ─────────────────────────────────
 *
 * Os dias já criados ficam. Não há transação entre chamadas, e desfazer
 * exigiria apagar treinos que podem, nesse meio-tempo, já ter sido atribuídos
 * a alguém. Então a ação conta a verdade: diz quantos entraram e qual dia
 * parou, e o professor retoma dali. Um erro genérico depois de criar três
 * treinos em silêncio seria bem pior.
 */
export async function createWeekAction(
  _state: WorkoutActionState,
  formData: FormData,
): Promise<WorkoutActionState> {
  const session = await requireHubSession()

  try {
    requirePermission(session, 'workouts:write')

    const parsed = createWeekSchema.safeParse(
      parseWeekForm({
        goal: String(formData.get('goal') ?? ''),
        dayLabel: formData.getAll('dayLabel').map(String),
        dayName: formData.getAll('dayName').map(String),
        rowDay: formData.getAll('rowDay').map(String),
        exerciseId: formData.getAll('exerciseId').map(String),
        sets: formData.getAll('sets').map(String),
        reps: formData.getAll('reps').map(String),
        restSeconds: formData.getAll('restSeconds').map(String),
        suggestedLoad: formData.getAll('suggestedLoad').map(String),
        notes: formData.getAll('notes').map(String),
      }),
    )

    if (!parsed.success) {
      const campos = parsed.error.flatten().fieldErrors as Record<string, string[]>
      return {
        status: 'error',
        message:
          campos.days?.[0] ?? 'Cada dia precisa de um nome e ao menos um exercício escolhido.',
        fieldErrors: campos,
      }
    }

    const dataSource = await getDataSource()
    const staffId = await staffIdDaSessao(session.organizationId, session.userProfileId)
    const criados: string[] = []

    try {
      for (const dia of parsed.data.days) {
        const plan = await dataSource.createWorkoutPlan({
          organizationId: session.organizationId,
          name: dia.name,
          goal: parsed.data.goal || null,
          splitLabel: dia.splitLabel,
          createdByStaffId: staffId,
          exercises: dia.exercises.map((exercicio) => ({
            exerciseId: exercicio.exerciseId,
            sets: exercicio.sets,
            reps: exercicio.reps,
            restSeconds: exercicio.restSeconds,
            suggestedLoad: exercicio.suggestedLoad ?? null,
            notes: exercicio.notes || null,
          })),
        })
        criados.push(plan.id)
      }
    } catch (erro) {
      logger.error('workouts:week_partial', {
        organizationId: session.organizationId,
        criados: criados.length,
        total: parsed.data.days.length,
        error: String(erro),
      })
      return {
        status: 'error',
        message:
          criados.length === 0
            ? toUserMessage(erro)
            : `${criados.length} de ${parsed.data.days.length} dias foram criados. O dia ${parsed.data.days[criados.length]?.splitLabel} falhou — monte os que faltam e tente de novo.`,
      }
    }

    logger.info('workouts:week_created', {
      organizationId: session.organizationId,
      dias: criados.length,
      actorId: session.userProfileId,
    })

    revalidatePath('/workouts')
    revalidatePath('/dashboard')

    return {
      status: 'success',
      message: `Semana criada: ${criados.length} ${criados.length === 1 ? 'treino' : 'treinos'}. Abra cada um para atribuir aos alunos.`,
    }
  } catch (error) {
    if (!(error instanceof AppError)) {
      logger.error('workouts:week_failed', { error: String(error) })
    }
    return { status: 'error', message: toUserMessage(error) }
  }
}

/**
 * Atribuição do treino a um aluno.
 *
 * É esta escrita que faz o sino tocar: o gatilho da 0012 cria a notificação
 * "novo treino disponível" quando a linha entra em `workout_assignments`. Ele
 * existia desde então sem nada no produto capaz de acioná-lo.
 */
export async function assignWorkoutAction(
  _state: WorkoutActionState,
  formData: FormData,
): Promise<WorkoutActionState> {
  const session = await requireHubSession()

  try {
    requirePermission(session, 'workouts:write')

    const parsed = assignWorkoutSchema.safeParse({
      workoutPlanId: formData.get('workoutPlanId'),
      studentId: formData.get('studentId'),
      validUntil: formData.get('validUntil') ?? '',
    })

    if (!parsed.success) {
      return {
        status: 'error',
        message: parsed.error.issues[0]?.message ?? 'Escolha o aluno.',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      }
    }

    const dataSource = await getDataSource()

    /*
     * O plano precisa ser desta academia. Sem esta leitura, um id de treino de
     * outra organização colado no formulário criaria a atribuição — a RLS
     * barraria a escrita, mas o erro chegaria como falha genérica em vez de
     * "esse treino não é seu".
     */
    const plan = await dataSource.getWorkoutPlan(session.organizationId, parsed.data.workoutPlanId)
    if (!plan) return { status: 'error', message: 'Treino não encontrado nesta academia.' }

    await dataSource.assignWorkoutPlan({
      organizationId: session.organizationId,
      workoutPlanId: parsed.data.workoutPlanId,
      studentId: parsed.data.studentId,
      validUntil: parsed.data.validUntil || null,
    })

    logger.info('workouts:assigned', {
      organizationId: session.organizationId,
      workoutPlanId: parsed.data.workoutPlanId,
      studentId: parsed.data.studentId,
      actorId: session.userProfileId,
    })

    revalidatePath(`/workouts/${parsed.data.workoutPlanId}`)
    revalidatePath(`/students/${parsed.data.studentId}`)

    return { status: 'success', message: 'Treino atribuído. O aluno recebe o aviso no app.' }
  } catch (error) {
    if (!(error instanceof AppError)) {
      logger.error('workouts:assign_failed', { error: String(error) })
    }
    return { status: 'error', message: toUserMessage(error) }
  }
}
