'use server'

import { revalidatePath } from 'next/cache'

import { requireStudentSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { AppError, toUserMessage } from '@/lib/errors'
import { logger } from '@/lib/logger'
import type { RoutineBlock, RoutinePlan } from '@/types/domain'

/**
 * ── As portas do plano ──────────────────────────────────────────────────────
 *
 * Nenhuma recebe perfil: a identidade sai de `auth.uid()` dentro do banco.
 *
 * E **nada daqui registra evento de produto**. O resto do app conta tela
 * aberta e treino iniciado; a rotina da vida de alguém — hora de acordar, de
 * trabalhar, de dormir — não entra em indicador nem em painel. A 0070 escreveu
 * que a academia não lê isto; registrar o que a pessoa escreveu seria a mesma
 * informação saindo por outra porta.
 */

type Resposta = { ok: boolean; erro?: string }

async function tentar(nome: string, acao: () => Promise<void>): Promise<Resposta> {
  try {
    await requireStudentSession()
    await acao()
    revalidatePath('/app/plano')
    revalidatePath('/app/profile')
    return { ok: true }
  } catch (error) {
    if (!(error instanceof AppError)) {
      logger.error(`plano:${nome}_falhou`, { error: String(error) })
    }
    return { ok: false, erro: toUserMessage(error) }
  }
}

/** A meta e as âncoras do dia. Gravar de novo é corrigir. */
export async function salvarMetaAction(plano: RoutinePlan): Promise<Resposta> {
  return tentar('meta', async () => {
    const dataSource = await getDataSource()
    await dataSource.setRoutinePlan(plano)
    /*
     * O log não leva a meta. "A pessoa salvou uma meta" é operação; o que ela
     * escreveu é dela.
     */
    logger.info('plano:meta_salva', {})
  })
}

export async function salvarBlocoAction(
  bloco: Omit<RoutineBlock, 'id'> & { id?: string | null },
): Promise<Resposta & { id?: string }> {
  try {
    await requireStudentSession()
    const dataSource = await getDataSource()
    const id = await dataSource.saveRoutineBlock(bloco)
    logger.info('plano:bloco_salvo', { kind: bloco.kind, novo: !bloco.id })
    revalidatePath('/app/plano')
    return { ok: true, id }
  } catch (error) {
    if (!(error instanceof AppError)) logger.error('plano:bloco_falhou', { error: String(error) })
    return { ok: false, erro: toUserMessage(error) }
  }
}

export async function apagarBlocoAction(id: string): Promise<Resposta> {
  return tentar('apagar', async () => {
    const dataSource = await getDataSource()
    await dataSource.deleteRoutineBlock(id)
  })
}
