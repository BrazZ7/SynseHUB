'use server'

import { revalidatePath } from 'next/cache'

import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { AppError, toUserMessage } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { requirePermission } from '@/lib/permissions/guard'
import { montarRefeicoes, saveNutritionPlanSchema } from '@/lib/validations/nutrition'
import type { NutritionActionState } from '@/features/nutrition/state'

/**
 * Quem assina o plano.
 *
 * `author_staff_id` é não-nulo desde a 0003 — "plano individual só existe com
 * profissional responsável". Sem ficha na academia não há como assinar, e a
 * escrita é recusada aqui com a frase em vez de um erro de constraint.
 */
async function staffIdDaSessao(organizationId: string, userProfileId: string) {
  const dataSource = await getDataSource()
  const staff = await dataSource.listStaff(organizationId)
  return staff.find((member) => member.userProfileId === userProfileId)?.id ?? null
}

export async function saveNutritionPlanAction(
  _state: NutritionActionState,
  formData: FormData,
): Promise<NutritionActionState> {
  const session = await requireHubSession()

  try {
    requirePermission(session, 'nutrition:write')

    const parsed = saveNutritionPlanSchema.safeParse({
      studentId: formData.get('studentId') ?? '',
      title: formData.get('title') ?? '',
      notes: formData.get('notes') ?? '',
      targetCalories: formData.get('targetCalories') ?? '',
      targetProteinG: formData.get('targetProteinG') ?? '',
      targetCarbsG: formData.get('targetCarbsG') ?? '',
      targetFatG: formData.get('targetFatG') ?? '',
      mealName: formData.getAll('mealName').map(String),
      mealTime: formData.getAll('mealTime').map(String),
      itemMeal: formData.getAll('itemMeal').map(String),
      itemDescription: formData.getAll('itemDescription').map(String),
      itemQuantity: formData.getAll('itemQuantity').map(String),
      itemCalories: formData.getAll('itemCalories').map(String),
      itemProtein: formData.getAll('itemProtein').map(String),
      itemCarbs: formData.getAll('itemCarbs').map(String),
      itemFat: formData.getAll('itemFat').map(String),
    })

    if (!parsed.success) {
      return {
        status: 'error',
        message: parsed.error.issues[0]?.message ?? 'Revise os campos destacados.',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      }
    }

    const refeicoes = montarRefeicoes(parsed.data)
    if (refeicoes.length === 0) {
      return { status: 'error', message: 'Um plano sem refeições não vai ajudar ninguém.' }
    }

    const autor = await staffIdDaSessao(session.organizationId, session.userProfileId)
    if (!autor) {
      return {
        status: 'error',
        message: 'Plano alimentar precisa de responsável técnico, e você não tem ficha nesta academia.',
      }
    }

    const planId = String(formData.get('planId') ?? '')
    const dataSource = await getDataSource()

    if (planId) {
      const existente = await dataSource.getNutritionPlan(session.organizationId, planId)
      if (!existente) return { status: 'error', message: 'Plano não encontrado nesta academia.' }
      /*
       * Plano publicado não é reescrito: o aluno está seguindo ele hoje, e
       * mudar por baixo apagaria o registro do que foi prescrito. A tela oferece
       * "nova versão"; esta recusa é a rede embaixo.
       */
      if (existente.status === 'PUBLISHED') {
        return {
          status: 'error',
          message: 'Este plano está publicado. Abra uma nova versão para alterá-lo.',
        }
      }
    }

    const dados = parsed.data
    const plano = await dataSource.saveNutritionPlan({
      id: planId || undefined,
      organizationId: session.organizationId,
      studentId: dados.studentId,
      authorStaffId: autor,
      title: dados.title,
      notes: dados.notes || null,
      targetCalories: dados.targetCalories,
      targetProteinG: dados.targetProteinG,
      targetCarbsG: dados.targetCarbsG,
      targetFatG: dados.targetFatG,
      meals: refeicoes,
    })

    revalidatePath('/nutrition')
    revalidatePath(`/nutrition/${plano.id}`)

    return {
      status: 'success',
      message: `Rascunho salvo com ${refeicoes.length} refeições. Publique para o aluno ver.`,
      planId: plano.id,
    }
  } catch (error) {
    if (!(error instanceof AppError)) logger.error('nutrition:save_failed', { error: String(error) })
    return { status: 'error', message: toUserMessage(error) }
  }
}

/** Publica e arquiva o anterior. O aviso ao aluno sai do banco. */
export async function publishNutritionPlanAction(
  _state: NutritionActionState,
  formData: FormData,
): Promise<NutritionActionState> {
  const session = await requireHubSession()

  try {
    requirePermission(session, 'nutrition:write')
    const planId = String(formData.get('planId') ?? '')
    if (!planId) return { status: 'error', message: 'Plano inválido.' }

    const dataSource = await getDataSource()
    const plano = await dataSource.getNutritionPlan(session.organizationId, planId)
    if (!plano) return { status: 'error', message: 'Plano não encontrado nesta academia.' }

    await dataSource.publishNutritionPlan(planId)

    logger.info('nutrition:published', {
      organizationId: session.organizationId,
      planId,
      studentId: plano.studentId,
      actorId: session.userProfileId,
    })

    revalidatePath('/nutrition')
    revalidatePath(`/nutrition/${planId}`)
    revalidatePath('/app/nutrition')

    return { status: 'success', message: 'Plano publicado. O aluno recebeu o aviso no app.' }
  } catch (error) {
    if (!(error instanceof AppError)) {
      logger.error('nutrition:publish_failed', { error: String(error) })
    }
    return { status: 'error', message: toUserMessage(error) }
  }
}

export async function newNutritionVersionAction(
  _state: NutritionActionState,
  formData: FormData,
): Promise<NutritionActionState> {
  const session = await requireHubSession()

  try {
    requirePermission(session, 'nutrition:write')
    const planId = String(formData.get('planId') ?? '')

    const dataSource = await getDataSource()
    const plano = await dataSource.getNutritionPlan(session.organizationId, planId)
    if (!plano) return { status: 'error', message: 'Plano não encontrado nesta academia.' }

    const nova = await dataSource.newNutritionPlanVersion(planId)
    revalidatePath('/nutrition')

    return {
      status: 'success',
      message: 'Nova versão aberta como rascunho. O plano atual continua valendo até você publicar.',
      planId: nova,
    }
  } catch (error) {
    if (!(error instanceof AppError)) {
      logger.error('nutrition:version_failed', { error: String(error) })
    }
    return { status: 'error', message: toUserMessage(error) }
  }
}
