'use server'

import { requireSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { isPendingMigration } from '@/lib/database/pending-migration'
import { logger } from '@/lib/logger'
import { enviarAviso } from '@/lib/push/send'
import { rateLimit } from '@/lib/rate-limit'
import type { PushActionState } from '@/features/push/state'

/**
 * ── Ligar e desligar o aviso neste aparelho ──────────────────────────────────
 *
 * A inscrição é feita pelo navegador; o servidor só a guarda. Toda a
 * autorização é do banco: `register_push_subscription` amarra a linha ao
 * perfil da sessão, e `remove_push_subscription` só alcança a própria — então
 * conferir aqui de novo seria duplicar a regra em dois lugares que podem
 * divergir.
 */

function comoErro(erro: unknown, padrao: string): PushActionState {
  if (isPendingMigration(erro)) {
    logger.warn('push:schema_pendente', { detalhe: 'Migration 0040 pendente.' })
    return { error: 'Recurso ainda não disponível. Tente de novo em alguns minutos.' }
  }
  logger.warn('push:acao_falhou', { error: String(erro).slice(0, 200) })
  return { error: padrao }
}

export async function registrarPushAction(
  _state: PushActionState,
  formData: FormData,
): Promise<PushActionState> {
  const session = await requireSession()

  const endpoint = String(formData.get('endpoint') ?? '').trim()
  const p256dh = String(formData.get('p256dh') ?? '').trim()
  const auth = String(formData.get('auth') ?? '').trim()
  if (!endpoint || !p256dh || !auth) return { error: 'Inscrição incompleta.' }

  /*
   * Limite por conta. Registrar é barato, mas é escrita sem confirmação
   * humana: um laço no cliente encheria a tabela de endpoints de um aparelho
   * só. Vinte por minuto cobre com folga o normal, que é um por aparelho.
   */
  const limite = rateLimit(`push:${session.userProfileId}`, 20, 60_000)
  if (!limite.allowed) return { error: 'Muitas tentativas. Aguarde um minuto.' }

  try {
    const dataSource = await getDataSource()
    await dataSource.registerPushSubscription({
      endpoint,
      p256dh,
      auth,
      userAgent: String(formData.get('userAgent') ?? '').slice(0, 300) || null,
    })

    /*
     * O aviso de teste sai na hora, e não é enfeite: é a única forma de a
     * pessoa saber que funcionou. Permissão concedida no navegador e nenhum
     * aviso depois é indistinguível de recurso quebrado.
     */
    const entregues = await enviarAviso(session.userProfileId, {
      titulo: 'Avisos ligados',
      corpo: 'É assim que o Synse vai te avisar, mesmo com o app fechado.',
      url: '/app/notifications',
      tag: 'synse-teste',
    })

    logger.info('push:registrado', { entregues })
    return { ok: 'Pronto. Mandamos um aviso de teste agora.' }
  } catch (erro) {
    return comoErro(erro, 'Não foi possível ligar os avisos.')
  }
}

export async function removerPushAction(
  _state: PushActionState,
  formData: FormData,
): Promise<PushActionState> {
  await requireSession()

  const endpoint = String(formData.get('endpoint') ?? '').trim()
  if (!endpoint) return { error: 'Inscrição inválida.' }

  try {
    const dataSource = await getDataSource()
    await dataSource.removePushSubscription(endpoint)
    return { ok: 'Avisos desligados neste aparelho.' }
  } catch (erro) {
    return comoErro(erro, 'Não foi possível desligar os avisos.')
  }
}
