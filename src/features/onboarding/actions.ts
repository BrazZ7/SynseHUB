'use server'

import { redirect } from 'next/navigation'

import { requireOnboarding } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { logger } from '@/lib/logger'
import { rateLimit } from '@/lib/rate-limit'
import { slugify } from '@/lib/utils'
import { createOrganizationSchema, personalStartSchema } from '@/lib/validations/organization'
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
      type: 'GYM',
    })
  } catch (error) {
    logger.error('onboarding:failed', { authUserId, error: String(error) })
    return { error: 'Não foi possível concluir o cadastro. Tente novamente.' }
  }

  redirect('/dashboard')
}

/**
 * Entrada da pessoa física, com ou sem academia.
 *
 * Os dois caminhos que existiam viraram um. Com código, a matrícula nasce
 * pendente de confirmação: a academia vê quem entrou e aprova — nascer ativa
 * colocaria o aluno na contagem de mensalidades de uma academia que nunca o
 * cadastrou. Sem código, a matrícula vai para a organização reservada do Synse
 * e nasce ativa, porque não há quem confirme.
 */
export async function startPersonalAction(
  _state: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const authUserId = await requireOnboarding()

  const parsed = personalStartSchema.safeParse({
    studentName: formData.get('studentName'),
    inviteCode: formData.get('inviteCode') ?? '',
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Confira os dados informados.' }
  }

  /*
   * Limite apertado de propósito: sem ele, o código de seis caracteres vira
   * alvo de tentativa e erro até alguém entrar numa academia qualquer.
   */
  const limit = rateLimit(`start:${authUserId}`, 8, 600_000)
  if (!limit.allowed) {
    return { error: 'Muitas tentativas. Aguarde alguns minutos e confira o código.' }
  }

  try {
    const dataSource = await getDataSource()

    if (parsed.data.inviteCode) {
      await dataSource.joinOrganizationAsStudent({
        inviteCode: parsed.data.inviteCode,
        studentName: parsed.data.studentName,
      })
    } else {
      await dataSource.joinSynseAsSoloStudent({ studentName: parsed.data.studentName })
    }
  } catch (error) {
    const mensagem = String(error)
    if (mensagem.includes('Código de convite inválido')) {
      /*
       * Código errado não pode ser beco sem saída: agora existe a alternativa
       * de entrar sem nenhum, e a mensagem precisa dizer isso — senão a pessoa
       * fica presa tentando adivinhar seis caracteres.
       */
      return {
        error:
          'Código não encontrado. Confira com a recepção da academia, ou deixe o campo em branco para entrar sem vínculo.',
      }
    }
    logger.error('onboarding:start_failed', { authUserId, error: mensagem })
    return { error: 'Não foi possível começar agora. Tente novamente.' }
  }

  redirect('/app')
}
