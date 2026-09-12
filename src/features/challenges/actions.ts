'use server'

import { revalidatePath } from 'next/cache'

import { requireStudentSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { isPendingMigration } from '@/lib/database/pending-migration'
import { logger } from '@/lib/logger'
import { rateLimit } from '@/lib/rate-limit'
import type { ChallengeActionState } from '@/features/challenges/state'

/*
 * As duas ações abaixo não conferem plano nem limite: quem confere é o banco,
 * na função. Repetir a regra aqui criaria duas versões dela, e a que o cliente
 * consegue burlar é sempre a de cima.
 */
export async function chooseChallengeAction(
  _state: ChallengeActionState,
  formData: FormData,
): Promise<ChallengeActionState> {
  const session = await requireStudentSession()
  const code = String(formData.get('code') ?? '').trim()

  if (!code) return { error: 'Escolha um desafio.' }

  try {
    const dataSource = await getDataSource()
    await dataSource.chooseBaselineChallenge(code)
  } catch (error) {
    const mensagem = String(error)
    if (mensagem.includes('um desafio por mês')) {
      return { error: 'No plano gratuito você escolhe um desafio por mês.' }
    }
    if (mensagem.includes('plano Pro')) {
      return { error: 'Este desafio faz parte do Synse+.' }
    }
    if (isPendingMigration(error)) {
      return { error: 'Os desafios ainda estão sendo liberados nesta conta.' }
    }
    logger.error('challenges:choose_failed', {
      userProfileId: session.userProfileId,
      error: mensagem.slice(0, 200),
    })
    return { error: 'Não foi possível escolher agora. Tente novamente.' }
  }

  revalidatePath('/app/challenges')
  revalidatePath('/app')
  return { message: 'Desafio escolhido. Bom mês.' }
}

export async function recordProgressAction(
  _state: ChallengeActionState,
  formData: FormData,
): Promise<ChallengeActionState> {
  const session = await requireStudentSession()

  const code = String(formData.get('code') ?? '').trim()
  const delta = Number(String(formData.get('delta') ?? '').replace(',', '.'))

  if (!code || !Number.isFinite(delta) || delta <= 0) {
    return { error: 'Informe um valor maior que zero.' }
  }

  // Lançamento é manual e sem custo: sem limite, vira alvo de script.
  const limit = rateLimit(`challenge:${session.userProfileId}`, 30, 600_000)
  if (!limit.allowed) return { error: 'Muitos lançamentos seguidos. Tente daqui a pouco.' }

  try {
    const dataSource = await getDataSource()
    const total = await dataSource.recordChallengeProgress(code, delta)
    revalidatePath('/app/challenges')
    revalidatePath('/app')
    return { message: `Registrado. Você está em ${total.toLocaleString('pt-BR')}.` }
  } catch (error) {
    const mensagem = String(error)
    if (mensagem.includes('entre 0 e 1000')) return { error: 'Informe um valor entre 0 e 1000.' }
    if (mensagem.includes('não tem este desafio')) {
      return { error: 'Este desafio não está em andamento.' }
    }
    if (isPendingMigration(error)) {
      return { error: 'Os desafios ainda estão sendo liberados nesta conta.' }
    }
    logger.error('challenges:progress_failed', {
      userProfileId: session.userProfileId,
      error: mensagem.slice(0, 200),
    })
    return { error: 'Não foi possível registrar agora. Tente novamente.' }
  }
}
