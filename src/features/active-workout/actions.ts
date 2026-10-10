'use server'

import { requireStudentSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { AppError, toUserMessage } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { workoutPreferencesSchema } from '@/lib/validations/workout'
import type { WorkoutPreferences } from '@/types/domain'

/**
 * As escritas do Treino Ativo.
 *
 * Não usam `useActionState`: quem chama é a fila de sincronização, não um
 * formulário. Cada uma devolve um resultado simples que a fila entende — deu
 * certo, apaga da fila; deu errado, tenta de novo.
 *
 * Nenhuma delas recebe `studentId`. O aluno sai da sessão autenticada, e depois
 * o próprio banco resolve de novo pelo `auth.uid()`. Duas camadas conferindo a
 * mesma coisa não é redundância desperdiçada: a de cima dá mensagem boa, a de
 * baixo é a que não dá para contornar.
 */

export type SyncResult = { ok: true; id?: string } | { ok: false; erro: string }

export async function startWorkoutSessionAction(
  clientId: string,
  workoutPlanId: string | null,
): Promise<SyncResult> {
  try {
    await requireStudentSession()
    const dataSource = await getDataSource()
    const id = await dataSource.startWorkoutSession(clientId, workoutPlanId)
    logger.info('workout:session_started', { sessionId: id })
    return { ok: true, id }
  } catch (error) {
    if (!(error instanceof AppError)) logger.error('workout:start_failed', { error: String(error) })
    return { ok: false, erro: toUserMessage(error) }
  }
}

export async function logWorkoutSetAction(input: {
  sessionId: string
  exerciseId: string
  setNumber: number
  repsCompleted: number
  clientId: string
  weight: number | null
  repsPlanned: number | null
  restSeconds: number | null
  startedAt: string | null
  completedAt: string
}): Promise<SyncResult> {
  try {
    await requireStudentSession()
    const dataSource = await getDataSource()
    const id = await dataSource.logWorkoutSet(input)
    return { ok: true, id }
  } catch (error) {
    if (!(error instanceof AppError)) {
      logger.error('workout:log_set_failed', { error: String(error) })
    }
    return { ok: false, erro: toUserMessage(error) }
  }
}

export async function finishWorkoutSessionAction(
  sessionId: string,
  durationSeconds: number,
  status: 'COMPLETED' | 'ABANDONED',
): Promise<SyncResult> {
  try {
    await requireStudentSession()
    const dataSource = await getDataSource()
    await dataSource.finishWorkoutSession(sessionId, durationSeconds, status)
    logger.info('workout:session_finished', { sessionId, durationSeconds, status })
    return { ok: true }
  } catch (error) {
    if (!(error instanceof AppError)) {
      logger.error('workout:finish_failed', { error: String(error) })
    }
    return { ok: false, erro: toUserMessage(error) }
  }
}

/**
 * As preferências do treino, gravadas no servidor.
 *
 * ── Por que a validação está aqui ──────────────────────────────────────────
 *
 * Esta action recebe um objeto inteiro vindo do cliente. Até ganhar o
 * `safeParse`, ela o entregava ao banco como veio: a única defesa era o
 * `check (default_rest_seconds between 0 and 900)` da 0026 — que recusa, sim,
 * mas devolvendo erro de banco onde deveria haver uma frase, e sem dizer nada
 * sobre os cinco booleanos.
 *
 * `user_profile_id` continua saindo da sessão, nunca do argumento, e a RLS
 * (`workout_preferences_self`, 0026) confere de novo pelo `auth_profile_id()`.
 * O que o esquema acrescenta é a forma — e `analise.data` traz só as chaves
 * declaradas, então campo a mais colado pelo cliente não chega ao `upsert`.
 */
export async function saveWorkoutPreferencesAction(
  preferencias: WorkoutPreferences,
): Promise<SyncResult> {
  try {
    const session = await requireStudentSession()

    const analise = workoutPreferencesSchema.safeParse(preferencias)
    if (!analise.success) {
      throw new AppError(
        'invalid_input',
        'Não reconhecemos estes ajustes de treino.',
        422,
        analise.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      )
    }

    const dataSource = await getDataSource()
    await dataSource.saveWorkoutPreferences(session.userProfileId, analise.data)
    return { ok: true }
  } catch (error) {
    if (!(error instanceof AppError)) {
      logger.error('workout:preferences_failed', { error: String(error) })
    }
    return { ok: false, erro: toUserMessage(error) }
  }
}
