'use server'

import { revalidatePath } from 'next/cache'

import { recalculateFromRoute } from '@/features/synse-run/engine/recalculate'
import { requireSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { isPendingMigration } from '@/lib/database/pending-migration'
import { logger } from '@/lib/logger'
import { isSoloOrganization } from '@/lib/organizations/solo'
import { saveActivitySchema } from '@/lib/validations/activity'
import type { ActivityPrivacy } from '@/types/domain'
import type { ActivityPrivacyResult, SaveActivityResult } from '@/features/synse-run/state'

/**
 * Recebe a corrida inteira, já calculada no aparelho.
 *
 * O servidor **não confia** nos números: ele confia na rota. Distância, pace e
 * elevação são recalculados a partir dos pontos, porque um payload é editável
 * e um ranking com números que a pessoa digita não é ranking.
 *
 * Recalcular também conserta o caso honesto: uma versão antiga do app, com um
 * filtro pior, mandaria números diferentes dos de hoje para a mesma rota.
 */
export async function saveActivityAction(payload: unknown): Promise<SaveActivityResult> {
  const session = await requireSession()

  const parsed = saveActivitySchema.safeParse(payload)
  if (!parsed.success) {
    logger.warn('synse-run:payload_invalido', {
      erro: parsed.error.issues[0]?.message,
      campo: parsed.error.issues[0]?.path.join('.'),
    })
    return { status: 'error', message: 'Não foi possível ler os dados desta atividade.' }
  }

  const atividade = parsed.data

  /*
   * A rota manda. Os números do aparelho servem para desenhar a tela na hora;
   * o que fica gravado é recalculado aqui, dos pontos.
   */
  const conferido = recalculateFromRoute({
    route: atividade.route,
    sport: atividade.sport,
    reportedMovingSeconds: atividade.movingSeconds,
  })

  const divergencia = Math.abs(conferido.distanceMeters - atividade.distanceMeters)
  if (divergencia > Math.max(50, atividade.distanceMeters * 0.02)) {
    /*
     * Divergência grande não recusa a corrida — a rota é a verdade e ela já
     * prevaleceu. Mas registra: ou o filtro do aparelho está diferente do
     * servidor, ou alguém mexeu no payload, e os dois merecem ser vistos.
     */
    logger.warn('synse-run:divergencia', {
      aparelho: Math.round(atividade.distanceMeters),
      servidor: Math.round(conferido.distanceMeters),
      pontos: atividade.route.length,
    })
  }

  try {
    const dataSource = await getDataSource()

    const id = await dataSource.saveActivity({
      ...atividade,
      distanceMeters: conferido.distanceMeters,
      elapsedSeconds: conferido.elapsedSeconds,
      movingSeconds: conferido.movingSeconds,
      averagePace: conferido.averagePace,
      bestPace: conferido.bestPace,
      averageSpeed: conferido.averageSpeed,
      maxSpeed: conferido.maxSpeed,
      elevationGain: conferido.elevationGain,
      elevationLoss: conferido.elevationLoss,
      minAltitude: conferido.minAltitude,
      maxAltitude: conferido.maxAltitude,
      calories: conferido.calories,
      splits: conferido.splits,
      route: atividade.route.map((ponto, indice) => ({
        ...ponto,
        distanceFromPrevious: conferido.points[indice]?.distanceFromPrevious ?? 0,
        totalDistance: conferido.points[indice]?.totalDistance ?? 0,
      })),
      userProfileId: session.userProfileId,
      /*
       * Quem treina por conta própria não tem academia para compartilhar: a
       * organização reservada existe para dar sessão, não para virar clube de
       * corrida.
       */
      organizationId: isSoloOrganization(session.organizationId) ? null : session.organizationId,
      title: atividade.title ?? null,
    })

    logger.info('synse-run:atividade_salva', {
      id,
      metros: Math.round(conferido.distanceMeters),
      pontos: atividade.route.length,
    })

    revalidatePath('/app/run')
    revalidatePath('/app')

    return { status: 'success', activityId: id }
  } catch (error) {
    if (isPendingMigration(error)) {
      return {
        status: 'error',
        message:
          'O SynseRun ainda está sendo liberado nesta conta. Sua corrida ficou salva no aparelho.',
      }
    }

    logger.error('synse-run:falha_ao_salvar', { error: String(error).slice(0, 300) })
    return {
      status: 'error',
      message: 'Não foi possível salvar agora. Sua corrida ficou guardada e sobe sozinha depois.',
    }
  }
}

/**
 * ── As duas devolviam `void` ────────────────────────────────────────────────
 *
 * E engoliam a exceção num `logger.error`. Ficaram assim enquanto nenhuma
 * tela as chamava, o que escondeu o problema: para "salvar rascunho" engolir
 * é defensável; para privacidade, não. A tela diria "pronto, está escondida"
 * e a corrida continuaria no ranking, com o traçado do percurso — que passa
 * na porta de casa de quem correu.
 *
 * Agora devolvem resultado, e a tela só diz que deu certo quando deu.
 */
export async function updateActivityPrivacyAction(
  activityId: string,
  privacy: ActivityPrivacy,
): Promise<ActivityPrivacyResult> {
  await requireSession()

  try {
    const dataSource = await getDataSource()
    // A RLS garante que só o dono altera: a política filtra por perfil, então
    // um id de outra pessoa simplesmente não encontra linha para atualizar.
    await dataSource.updateActivityPrivacy(activityId, privacy)
    revalidatePath(`/app/run/${activityId}`)
    revalidatePath('/app/run')
    return { status: 'success' }
  } catch (error) {
    logger.error('synse-run:falha_privacidade', { error: String(error).slice(0, 200) })
    return { status: 'error', message: 'Não foi possível mudar a privacidade. Tente de novo.' }
  }
}

export async function deleteActivityAction(activityId: string): Promise<ActivityPrivacyResult> {
  await requireSession()

  try {
    const dataSource = await getDataSource()
    await dataSource.deleteActivity(activityId)
    revalidatePath('/app/run')
    revalidatePath('/app/run/history')
    return { status: 'success' }
  } catch (error) {
    logger.error('synse-run:falha_ao_apagar', { error: String(error).slice(0, 200) })
    return { status: 'error', message: 'Não foi possível apagar esta corrida. Tente de novo.' }
  }
}
