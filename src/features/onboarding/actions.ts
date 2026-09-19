'use server'

import { redirect } from 'next/navigation'

import { requireOnboarding } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { isPendingMigration } from '@/lib/database/pending-migration'
import { logger } from '@/lib/logger'
import { rateLimit } from '@/lib/rate-limit'
import { slugify } from '@/lib/utils'
import { createOrganizationSchema, personalStartSchema } from '@/lib/validations/organization'
import { recordSignupConsents } from '@/features/consents/actions'
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
    await recordSignupConsents()
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
    await recordSignupConsents()
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
    /*
     * "Tente novamente" para um caminho que nunca vai funcionar é a pior
     * resposta possível: manda a pessoa repetir o que não tem como dar certo.
     *
     * Entrar sem código depende da migration 0013 — publicar não a aplica, e
     * enquanto ela não sobe essa metade do formulário não existe no banco. A
     * outra metade, o código, é da 0011 e funciona. A mensagem diz isso, em
     * vez de mandar insistir.
     */
    if (isPendingMigration(error)) {
      logger.error('onboarding:schema_pending', { authUserId, error: mensagem.slice(0, 200) })
      return {
        error: parsed.data.inviteCode
          ? 'Esta entrada ainda está sendo liberada. Tente novamente em alguns minutos.'
          : 'Ainda não é possível entrar sem vínculo nesta conta. Informe o código da sua academia para entrar agora.',
      }
    }

    logger.error('onboarding:start_failed', { authUserId, error: mensagem })
    return { error: 'Não foi possível começar agora. Tente novamente.' }
  }

  redirect('/app')
}
