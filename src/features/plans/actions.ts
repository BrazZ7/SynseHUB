'use server'

import { revalidatePath } from 'next/cache'

import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { AppError, toUserMessage } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { requirePermission } from '@/lib/permissions/guard'
import { createPlanSchema } from '@/lib/validations/plan'
import { parsePlanForm } from '@/features/plans/form'
import type { PlanActionState } from '@/features/plans/state'

/**
 * Criação de plano de mensalidade.
 *
 * Ordem obrigatória: sessão → permissão → validação → escrita. A permissão é
 * conferida no servidor mesmo que o botão só apareça para quem pode — o botão
 * é conveniência, não controle de acesso.
 */
export async function createPlanAction(
  _state: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  const session = await requireHubSession()

  try {
    requirePermission(session, 'plans:write')

    const parsed = createPlanSchema.safeParse(
      parsePlanForm(Object.fromEntries(formData) as Record<string, string>),
    )

    if (!parsed.success) {
      return {
        status: 'error',
        message: 'Revise os campos destacados.',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      }
    }

    const dataSource = await getDataSource()
    const plan = await dataSource.createPlan({
      organizationId: session.organizationId,
      name: parsed.data.name,
      description: parsed.data.description || null,
      price: parsed.data.price,
      billingCycle: parsed.data.billingCycle,
      enrollmentFee: parsed.data.enrollmentFee,
      weeklyAccessDays: parsed.data.weeklyAccessDays ?? null,
      benefits: parsed.data.benefits,
      autoCharge: parsed.data.autoCharge,
      status: 'ACTIVE',
    })

    logger.info('plans:created', {
      organizationId: session.organizationId,
      planId: plan.id,
      actorId: session.userProfileId,
    })

    revalidatePath('/plans')
    // A matrícula lê a lista de planos ativos; sem isto o plano recém-criado
    // não aparece no formulário de aluno até a próxima navegação completa.
    revalidatePath('/students/new')
    revalidatePath('/dashboard')

    return {
      status: 'success',
      message: `Plano ${plan.name} criado. Já pode ser usado numa matrícula.`,
      createdId: plan.id,
    }
  } catch (error) {
    if (!(error instanceof AppError)) {
      logger.error('plans:create_failed', { error: String(error) })
    }
    return { status: 'error', message: toUserMessage(error) }
  }
}
