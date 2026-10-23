'use server'

import { requireStudentSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { AppError, toUserMessage } from '@/lib/errors'
import { logger } from '@/lib/logger'
import type { TimelineCursor, TimelineEntry } from '@/types/domain'

/**
 * A próxima página do histórico.
 *
 * Não recebe aluno: a função do banco resolve por `auth.uid()`. O cursor vem
 * da tela, e é só uma posição — mesmo adulterado, o pior que faz é pedir uma
 * página de um instante qualquer **do próprio histórico**.
 */
export async function proximaPaginaDoHistoricoAction(
  cursor: TimelineCursor,
  limite: number,
): Promise<{ ok: true; entradas: TimelineEntry[] } | { ok: false; erro: string }> {
  try {
    await requireStudentSession()
    const dataSource = await getDataSource()
    const entradas = await dataSource.listStudentTimeline(limite, cursor)
    return { ok: true, entradas }
  } catch (error) {
    if (!(error instanceof AppError)) {
      logger.error('historico:pagina_falhou', { error: String(error) })
    }
    return { ok: false, erro: toUserMessage(error) }
  }
}
