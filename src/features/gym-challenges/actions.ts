'use server'

import { revalidatePath } from 'next/cache'

import { requireHubSession, requireStudentSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { AppError, toUserMessage } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { requirePermission } from '@/lib/permissions/guard'
import { METRICAS, joinChallengeSchema, saveGymChallengeSchema } from '@/lib/validations/gym-challenge'
import type { GymChallengeActionState } from '@/features/gym-challenges/state'

async function staffIdDaSessao(organizationId: string, userProfileId: string) {
  const dataSource = await getDataSource()
  const staff = await dataSource.listStaff(organizationId)
  return staff.find((member) => member.userProfileId === userProfileId)?.id ?? null
}

export async function saveGymChallengeAction(
  _state: GymChallengeActionState,
  formData: FormData,
): Promise<GymChallengeActionState> {
  const session = await requireHubSession()

  try {
    requirePermission(session, 'challenges:write')

    const parsed = saveGymChallengeSchema.safeParse({
      title: formData.get('title') ?? '',
      description: formData.get('description') ?? '',
      metric: formData.get('metric') ?? 'CHECKINS',
      targetValue: formData.get('targetValue') ?? '',
      startsAt: formData.get('startsAt') ?? '',
      endsAt: formData.get('endsAt') ?? '',
      rankingEnabled: formData.get('rankingEnabled') === 'on',
      status: formData.get('status') ?? 'ACTIVE',
      reward: formData.get('reward') ?? '',
    })
    if (!parsed.success) {
      return {
        status: 'error',
        message: parsed.error.issues[0]?.message ?? 'Revise os campos destacados.',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      }
    }

    const challengeId = String(formData.get('challengeId') ?? '')
    const dataSource = await getDataSource()

    if (challengeId) {
      const existente = await dataSource.getGymChallenge(session.organizationId, challengeId)
      if (!existente) return { status: 'error', message: 'Desafio não encontrado nesta academia.' }
    }

    const dados = parsed.data
    await dataSource.saveGymChallenge({
      id: challengeId || undefined,
      organizationId: session.organizationId,
      title: dados.title,
      description: dados.description || null,
      metric: dados.metric,
      targetValue: dados.targetValue,
      // A unidade acompanha a métrica: deixar a academia digitar produziria
      // "50000 pontos" num desafio de volume.
      unit: METRICAS[dados.metric].unidade,
      startsAt: dados.startsAt,
      endsAt: dados.endsAt,
      rankingEnabled: dados.rankingEnabled,
      status: dados.status,
      reward: dados.reward || null,
      createdByStaffId: await staffIdDaSessao(session.organizationId, session.userProfileId),
    })

    revalidatePath('/challenges')
    revalidatePath('/app/challenges')

    return {
      status: 'success',
      message: challengeId ? 'Desafio atualizado.' : 'Desafio publicado para os alunos.',
    }
  } catch (error) {
    if (!(error instanceof AppError)) {
      logger.error('gym_challenges:save_failed', { error: String(error) })
    }
    return { status: 'error', message: toUserMessage(error) }
  }
}

/**
 * O aluno entra no desafio.
 *
 * `rankingOptIn` é a segunda tranca do consentimento — a academia liga o
 * ranking, e aqui a pessoa decide se o nome dela aparece. Quem não marca
 * participa e some do quadro.
 */
export async function joinGymChallengeAction(
  _state: GymChallengeActionState,
  formData: FormData,
): Promise<GymChallengeActionState> {
  await requireStudentSession()

  try {
    const parsed = joinChallengeSchema.safeParse({
      challengeId: formData.get('challengeId') ?? '',
      rankingOptIn: formData.get('rankingOptIn') === 'on',
    })
    if (!parsed.success) return { status: 'error', message: 'Desafio inválido.' }

    const dataSource = await getDataSource()
    await dataSource.joinGymChallenge(parsed.data.challengeId, parsed.data.rankingOptIn)

    revalidatePath('/app/challenges')
    return {
      status: 'success',
      message: parsed.data.rankingOptIn
        ? 'Você está no desafio e no ranking.'
        : 'Você está no desafio. Seu nome não aparece no ranking.',
    }
  } catch (error) {
    if (!(error instanceof AppError)) {
      logger.error('gym_challenges:join_failed', { error: String(error) })
    }
    return { status: 'error', message: toUserMessage(error) }
  }
}
