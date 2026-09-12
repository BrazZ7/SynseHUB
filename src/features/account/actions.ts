'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requireSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { isPendingMigration } from '@/lib/database/pending-migration'
import { logger } from '@/lib/logger'
import { rateLimit } from '@/lib/rate-limit'
import { slugify } from '@/lib/utils'
import { joinGymSchema } from '@/lib/validations/organization'

export type AccountActionState = { error?: string; message?: string }

export const initialAccountState: AccountActionState = {}

/**
 * Vincular a conta a uma academia, depois de já estar usando o app.
 *
 * É a segunda metade da decisão de tornar o código opcional na entrada: quem
 * começou sem vínculo precisa de um lugar para colocar o código quando ele
 * aparecer — a academia dele entra no Synse, ou ele troca de academia.
 */
export async function linkGymAction(
  _state: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const session = await requireSession()

  const parsed = joinGymSchema.safeParse({
    inviteCode: formData.get('inviteCode'),
    studentName: session.name,
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Confira o código informado.' }
  }

  // Mesmo limite da entrada: seis caracteres são poucos para tentativa e erro.
  const limit = rateLimit(`link:${session.userProfileId}`, 8, 600_000)
  if (!limit.allowed) {
    return { error: 'Muitas tentativas. Aguarde alguns minutos e confira o código.' }
  }

  try {
    const dataSource = await getDataSource()
    await dataSource.joinOrganizationAsStudent({
      inviteCode: parsed.data.inviteCode,
      studentName: parsed.data.studentName,
    })
  } catch (error) {
    const mensagem = String(error)
    if (mensagem.includes('Código de convite inválido')) {
      return { error: 'Código não encontrado. Confira com a recepção da academia.' }
    }
    logger.error('account:link_gym_failed', {
      userProfileId: session.userProfileId,
      error: mensagem.slice(0, 200),
    })
    return { error: 'Não foi possível vincular agora. Tente novamente.' }
  }

  revalidatePath('/app', 'layout')
  return { message: 'Pronto. A academia precisa confirmar sua matrícula.' }
}

/**
 * Abrir o espaço de quem assinou o plano profissional.
 *
 * A conferência de assinatura está no banco, em `open_professional_space`, e
 * não aqui: se um dia o botão aparecer por engano para quem não assinou, o
 * banco continua dizendo não.
 */
export async function openProfessionalSpaceAction(
  _state: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const session = await requireSession()
  const nome = String(formData.get('name') ?? '').trim()

  if (nome.length < 3) return { error: 'Informe o nome do seu espaço.' }

  try {
    const dataSource = await getDataSource()
    // O sufixo evita colisão entre dois "Studio Ana" sem obrigar ninguém a
    // inventar um identificador no meio do cadastro.
    await dataSource.openProfessionalSpace({
      name: nome,
      slug: `${slugify(nome)}-${Math.random().toString(36).slice(2, 7)}`,
      ownerName: session.name,
    })
  } catch (error) {
    const mensagem = String(error)
    if (mensagem.includes('exige o plano ativo')) {
      return { error: 'O perfil profissional exige o plano ativo.' }
    }
    if (mensagem.includes('já é proprietária')) {
      return { error: 'Esta conta já tem um espaço aberto.' }
    }
    if (isPendingMigration(error)) {
      return { error: 'O perfil profissional ainda está sendo liberado nesta conta.' }
    }
    logger.error('account:open_space_failed', {
      userProfileId: session.userProfileId,
      error: mensagem.slice(0, 200),
    })
    return { error: 'Não foi possível abrir o espaço agora. Tente novamente.' }
  }

  redirect('/dashboard')
}
