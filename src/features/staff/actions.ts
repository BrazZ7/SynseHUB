'use server'

import { revalidatePath } from 'next/cache'

import { redirect } from 'next/navigation'

import { requireHubSession, requireSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { AppError, toUserMessage } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { requirePermission } from '@/lib/permissions/guard'
import { rateLimit } from '@/lib/rate-limit'
import { createStaffInviteSchema } from '@/lib/validations/staff'
import { enviarConvite } from '@/features/staff/invite-mail'
import type { StaffActionState } from '@/features/staff/state'

/**
 * Convidar alguém para a equipe.
 *
 * A regra de quem pode convidar quem está no banco, em `create_staff_invite`,
 * e não aqui: um gerente não cria um dono. Se essa checagem morasse na action,
 * qualquer caminho novo até a tabela a contornaria — e o caminho para tomar a
 * academia seria convidar o próprio e-mail alternativo como OWNER.
 */
export async function inviteStaffAction(
  _state: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const session = await requireHubSession()

  try {
    requirePermission(session, 'staff:write')

    /*
     * O limite existe porque cada convite dispara um e-mail para um endereço
     * escolhido por quem chama. Sem ele, o painel de uma academia vira uma
     * pequena máquina de mandar mensagem em nome do Synse.
     */
    const limite = rateLimit(`invite:${session.organizationId}`, 20, 3_600_000)
    if (!limite.allowed) {
      return {
        status: 'error',
        message: 'Muitos convites em pouco tempo. Tente de novo daqui a pouco.',
      }
    }

    const parsed = createStaffInviteSchema.safeParse({
      email: formData.get('email'),
      role: formData.get('role'),
      jobTitle: formData.get('jobTitle') ?? '',
      registrationNumber: formData.get('registrationNumber') ?? '',
    })

    if (!parsed.success) {
      return {
        status: 'error',
        message: 'Revise os campos destacados.',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      }
    }

    const dataSource = await getDataSource()
    const token = await dataSource.createStaffInvite({
      organizationId: session.organizationId,
      email: parsed.data.email,
      role: parsed.data.role,
      jobTitle: parsed.data.jobTitle || null,
      registrationNumber: parsed.data.registrationNumber || null,
    })

    const envio = await enviarConvite(parsed.data.email, token)

    logger.info('staff:invited', {
      organizationId: session.organizationId,
      role: parsed.data.role,
      enviado: envio.enviado,
      actorId: session.userProfileId,
    })

    revalidatePath('/staff')

    return {
      status: 'success',
      message: envio.enviado
        ? `Convite enviado para ${parsed.data.email}. O link vale por sete dias.`
        : `Convite criado. O e-mail não saiu — mande o link abaixo. Ele vale por sete dias.`,
      link: envio.link,
    }
  } catch (error) {
    const mensagem = String(error)
    if (mensagem.includes('já faz parte')) {
      return { status: 'error', message: 'Esta pessoa já faz parte da equipe.' }
    }
    if (mensagem.includes('acesso maior')) {
      return { status: 'error', message: 'Você não pode convidar alguém com acesso maior que o seu.' }
    }
    if (mensagem.includes('direção da academia')) {
      return { status: 'error', message: 'Só a direção da academia convida a equipe.' }
    }
    if (!(error instanceof AppError)) {
      logger.error('staff:invite_failed', { error: mensagem.slice(0, 200) })
    }
    return { status: 'error', message: toUserMessage(error) }
  }
}

/** Cancela um convite que ainda não foi aceito. */
export async function revokeStaffInviteAction(
  _state: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const session = await requireHubSession()

  try {
    requirePermission(session, 'staff:write')

    const inviteId = String(formData.get('inviteId') ?? '')
    if (!inviteId) return { status: 'error', message: 'Convite não informado.' }

    const dataSource = await getDataSource()
    await dataSource.revokeStaffInvite(inviteId)

    revalidatePath('/staff')
    return { status: 'success', message: 'Convite cancelado. O link parou de valer.' }
  } catch (error) {
    if (!(error instanceof AppError)) {
      logger.error('staff:revoke_failed', { error: String(error).slice(0, 200) })
    }
    return { status: 'error', message: toUserMessage(error) }
  }
}

/**
 * Aceitar o convite.
 *
 * `requireSession` e não `requireHubSession`: quem chega aqui ainda não faz
 * parte de academia nenhuma — exigir sessão de painel mandaria a pessoa para o
 * cadastro de academia, que é o contrário do que ela veio fazer.
 *
 * A conferência que importa está no banco: a sessão precisa ser do e-mail
 * convidado. Sem isso o link viraria uma chave de acesso ao painel circulando
 * por aí.
 */
export async function acceptStaffInviteAction(
  _state: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  await requireSession()

  const token = String(formData.get('token') ?? '')
  if (!token) return { status: 'error', message: 'Convite não informado.' }

  try {
    const dataSource = await getDataSource()
    await dataSource.acceptStaffInvite(token)
  } catch (error) {
    const mensagem = String(error)
    if (mensagem.includes('outro e-mail')) {
      return {
        status: 'error',
        message:
          'Este convite é de outro e-mail. Saia da conta e entre com o endereço que recebeu o convite.',
      }
    }
    if (mensagem.includes('vencido')) {
      return { status: 'error', message: 'Convite vencido. Peça um novo à academia.' }
    }
    if (mensagem.includes('inválido ou já usado')) {
      return { status: 'error', message: 'Convite inválido ou já usado.' }
    }
    logger.error('staff:accept_failed', { error: mensagem.slice(0, 200) })
    return { status: 'error', message: 'Não foi possível aceitar agora. Tente novamente.' }
  }

  /*
   * O `redirect` fica fora do `try`: no Next ele funciona lançando uma exceção
   * de controle, e capturá-la aqui viraria "não foi possível aceitar" logo
   * depois de ter dado certo.
   */
  redirect('/dashboard')
}
