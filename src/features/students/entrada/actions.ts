'use server'

import { revalidatePath } from 'next/cache'

import { requireStudentSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { AppError, toUserMessage } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { studentIntakeSchema } from '@/lib/validations/workout'
import type { EntradaActionState } from '@/features/students/entrada/state'

/**
 * As escritas da entrada guiada.
 *
 * Nenhuma recebe `studentId`: a matrícula sai de `auth.uid()` dentro da função
 * do banco (0063). Receber do cliente seria deixar escolher a matrícula — e a
 * academia junto, já que `organization_id` vem dela.
 */

export async function responderEntradaAction(
  _state: EntradaActionState,
  formData: FormData,
): Promise<EntradaActionState> {
  try {
    await requireStudentSession()

    const analisado = studentIntakeSchema.safeParse({
      goal: String(formData.get('goal') ?? ''),
      experience: String(formData.get('experience') ?? ''),
      daysPerWeek: String(formData.get('daysPerWeek') ?? ''),
    })
    if (!analisado.success) {
      return { status: 'error', erro: analisado.error.issues[0]?.message ?? 'Resposta inválida.' }
    }

    const dataSource = await getDataSource()
    await dataSource.setStudentIntake(analisado.data)
    /*
     * O log guarda as três respostas porque nenhuma delas é dado de saúde:
     * objetivo, experiência e disponibilidade são preferência declarada. O que
     * nunca entra em log é o que a 0062 trouxe — dor e observação.
     */
    logger.info('aluno:entrada_respondida', analisado.data)

    revalidatePath('/app')
    return { status: 'success' }
  } catch (error) {
    if (!(error instanceof AppError)) {
      logger.error('aluno:entrada_falhou', { error: String(error) })
    }
    return { status: 'error', erro: toUserMessage(error) }
  }
}

export async function pularEntradaAction(): Promise<EntradaActionState> {
  try {
    await requireStudentSession()
    const dataSource = await getDataSource()
    await dataSource.skipStudentIntake()
    /*
     * Vale medir. "Quantos pulam" é a pergunta que diz se as três perguntas
     * são poucas o bastante — e é o número que justifica mexer nelas ou não.
     */
    logger.info('aluno:entrada_pulada', {})

    revalidatePath('/app')
    return { status: 'success' }
  } catch (error) {
    if (!(error instanceof AppError)) {
      logger.error('aluno:entrada_pular_falhou', { error: String(error) })
    }
    return { status: 'error', erro: toUserMessage(error) }
  }
}
