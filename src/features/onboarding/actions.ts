'use server'

import { redirect } from 'next/navigation'

import { requireOnboarding } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { logger } from '@/lib/logger'
import { rateLimit } from '@/lib/rate-limit'
import { slugify } from '@/lib/utils'
import { createOrganizationSchema } from '@/lib/validations/organization'
import type { OnboardingState } from '@/features/onboarding/state'

/** Cadastro da academia, logo após a criação da conta. */
export async function createOrganizationAction(
  _state: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const authUserId = await requireOnboarding()

  const parsed = createOrganizationSchema.safeParse({
    name: formData.get('name'),
    ownerName: formData.get('ownerName'),
    legalName: formData.get('legalName'),
    taxId: formData.get('taxId'),
    city: formData.get('city'),
    state: formData.get('state'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Confira os dados informados.' }
  }

  const limit = rateLimit(`onboarding:${authUserId}`, 5, 600_000)
  if (!limit.allowed) return { error: 'Muitas tentativas. Aguarde alguns minutos.' }

  // O slug vai na URL pública da academia, então precisa ser único. O sufixo
  // aleatório evita colisão entre duas "Academia Central" sem obrigar a pessoa
  // a inventar um identificador no meio do cadastro.
  const slug = `${slugify(parsed.data.name)}-${Math.random().toString(36).slice(2, 7)}`

  try {
    const dataSource = await getDataSource()
    await dataSource.createOrganization({
      name: parsed.data.name,
      slug,
      ownerName: parsed.data.ownerName,
      legalName: parsed.data.legalName || null,
      taxId: parsed.data.taxId || null,
      city: parsed.data.city || null,
      state: parsed.data.state || null,
    })
  } catch (error) {
    logger.error('onboarding:failed', { authUserId, error: String(error) })
    return { error: 'Não foi possível concluir o cadastro. Tente novamente.' }
  }

  redirect('/dashboard')
}
