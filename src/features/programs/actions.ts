'use server'

import { revalidatePath } from 'next/cache'

import { requireStudentSession } from '@/lib/auth/require-session'
import { toUserMessage } from '@/lib/errors'
import { getDataSource } from '@/lib/database'
import { logger } from '@/lib/logger'
import { pruneRateLimits, rateLimit } from '@/lib/rate-limit'
import type { ProgramaState } from '@/features/programs/state'

/**
 * ── As ações do programa guiado ─────────────────────────────────────────────
 *
 * Nenhuma delas decide permissão. Quem decide é a 0043: `iniciar_programa` e
 * `concluir_dia` conferem no banco se a conta enxerga o programa, e a
 * política de `program_enrollments` perdeu a escrita justamente para que não
 * houvesse um segundo caminho.
 *
 * O que estas funções fazem é traduzir a recusa do banco numa frase, e
 * revalidar a tela.
 */

async function comLimite(
  chave: string,
  limite: number,
  trabalho: () => Promise<void>,
): Promise<ProgramaState> {
  const session = await requireStudentSession()

  pruneRateLimits()
  if (!(await rateLimit(`${chave}:${session.userProfileId}`, limite, 60_000)).allowed) {
    return { status: 'error', message: 'Muitos toques seguidos. Espere um minuto.' }
  }

  try {
    await trabalho()
    revalidatePath('/app/programs')
    return { status: 'idle' }
  } catch (erro) {
    logger.warn(`programa:${chave}_falhou`, { erro: String(erro) })
    return { status: 'error', message: toUserMessage(erro) }
  }
}

export async function iniciarProgramaAction(
  _state: ProgramaState,
  formData: FormData,
): Promise<ProgramaState> {
  const id = String(formData.get('programId') ?? '')
  // Três por minuto: começar um programa é decisão, não toque repetido.
  return comLimite('iniciar', 3, async () => {
    const dataSource = await getDataSource()
    await dataSource.startProgram(id)
    revalidatePath(`/app/programs/${id}`)
  })
}

export async function marcarDiaAction(
  _state: ProgramaState,
  formData: FormData,
): Promise<ProgramaState> {
  const id = String(formData.get('programId') ?? '')
  const dia = Number(formData.get('dia') ?? 0)
  const desfazer = formData.get('desfazer') === '1'

  /*
   * Sessenta por minuto, bem acima do uso real: marcar e desmarcar é o gesto
   * mais repetido da tela, e um limite apertado puniria quem está só
   * acertando o que já fez. O limite aqui é contra laço automatizado, não
   * contra pressa.
   */
  return comLimite('dia', 60, async () => {
    const dataSource = await getDataSource()
    if (desfazer) await dataSource.undoProgramDay(id, dia)
    else await dataSource.completeProgramDay(id, dia)
    revalidatePath(`/app/programs/${id}`)
  })
}

export async function abandonarProgramaAction(
  _state: ProgramaState,
  formData: FormData,
): Promise<ProgramaState> {
  const id = String(formData.get('programId') ?? '')
  return comLimite('abandonar', 5, async () => {
    const dataSource = await getDataSource()
    await dataSource.abandonProgram(id)
    revalidatePath(`/app/programs/${id}`)
  })
}
