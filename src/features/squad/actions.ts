'use server'

import { revalidatePath } from 'next/cache'

import { requireStudentSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { AppError, toUserMessage } from '@/lib/errors'
import { logger } from '@/lib/logger'
import type { PresenceState, SquadRsvp } from '@/types/domain'

/**
 * ── As portas do lobby ──────────────────────────────────────────────────────
 *
 * Nenhuma destas recebe o perfil de quem chama: a identidade sai de
 * `auth.uid()` dentro do banco. Aqui a razão é concreta — são funções
 * `security definer` que leem e escrevem sobre **outras pessoas**, e um
 * parâmetro de perfil seria a porta para agir em nome de alguém.
 *
 * A autorização de verdade está no SQL (0068), não aqui: `is_squad_member`, o
 * teto de oito, "só o dono renomeia". Esta camada confere que há sessão e
 * traduz o erro; repetir as regras aqui criaria o segundo lugar para elas
 * divergirem.
 */

type Resposta = { ok: boolean; erro?: string }

async function tentar(nome: string, acao: () => Promise<void>): Promise<Resposta> {
  try {
    await requireStudentSession()
    await acao()
    /*
     * O lobby inteiro, e não só um pedaço: presença, treino marcado e resposta
     * mudam o mesmo cartão, e revalidar por partes deixaria metade da tela
     * velha depois de um toque.
     */
    revalidatePath('/app/esquadrao')
    revalidatePath('/app')
    return { ok: true }
  } catch (error) {
    if (!(error instanceof AppError)) {
      logger.error(`esquadrao:${nome}_falhou`, { error: String(error) })
    }
    return { ok: false, erro: toUserMessage(error) }
  }
}

/** "Cheguei", "tô a caminho", "treinando", "terminei" — ou nada. */
export async function definirPresencaAction(estado: PresenceState | null): Promise<Resposta> {
  return tentar('presenca', async () => {
    const dataSource = await getDataSource()
    await dataSource.setPresence(estado)
    logger.info('esquadrao:presenca', { estado })
  })
}

export async function criarEsquadraoAction(
  nome: string,
): Promise<Resposta & { squadId?: string }> {
  try {
    await requireStudentSession()
    const dataSource = await getDataSource()
    const squadId = await dataSource.createSquad(nome)
    logger.info('esquadrao:criado', {})
    revalidatePath('/app/esquadrao')
    return { ok: true, squadId }
  } catch (error) {
    if (!(error instanceof AppError)) logger.error('esquadrao:criar_falhou', { error: String(error) })
    return { ok: false, erro: toUserMessage(error) }
  }
}

export async function entrarNoEsquadraoAction(
  codigo: string,
): Promise<Resposta & { squadId?: string }> {
  try {
    await requireStudentSession()
    const dataSource = await getDataSource()
    const squadId = await dataSource.joinSquad(codigo)
    logger.info('esquadrao:entrou', {})
    revalidatePath('/app/esquadrao')
    return { ok: true, squadId }
  } catch (error) {
    if (!(error instanceof AppError)) logger.error('esquadrao:entrar_falhou', { error: String(error) })
    return { ok: false, erro: toUserMessage(error) }
  }
}

export async function sairDoEsquadraoAction(squadId: string): Promise<Resposta> {
  return tentar('sair', async () => {
    const dataSource = await getDataSource()
    await dataSource.leaveSquad(squadId)
  })
}

export async function renomearEsquadraoAction(squadId: string, nome: string): Promise<Resposta> {
  return tentar('renomear', async () => {
    const dataSource = await getDataSource()
    await dataSource.renameSquad(squadId, nome)
  })
}

export async function removerDoEsquadraoAction(
  squadId: string,
  profileId: string,
): Promise<Resposta> {
  return tentar('remover', async () => {
    const dataSource = await getDataSource()
    await dataSource.removeSquadMember(squadId, profileId)
  })
}

/** Marca o treino. A ficha é opcional — com ela, é o "enviar treino". */
export async function marcarTreinoDoEsquadraoAction(entrada: {
  squadId: string
  startsAt: string
  title?: string | null
  workoutPlanId?: string | null
}): Promise<Resposta> {
  return tentar('marcar', async () => {
    const dataSource = await getDataSource()
    await dataSource.scheduleSquadSession(entrada)
    logger.info('esquadrao:treino_marcado', { comFicha: Boolean(entrada.workoutPlanId) })
  })
}

export async function responderTreinoAction(
  sessionId: string,
  resposta: SquadRsvp,
): Promise<Resposta> {
  return tentar('responder', async () => {
    const dataSource = await getDataSource()
    await dataSource.answerSquadSession(sessionId, resposta)
  })
}

export async function cancelarTreinoDoEsquadraoAction(sessionId: string): Promise<Resposta> {
  return tentar('cancelar', async () => {
    const dataSource = await getDataSource()
    await dataSource.cancelSquadSession(sessionId)
  })
}
