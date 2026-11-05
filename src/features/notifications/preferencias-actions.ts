'use server'

import { revalidatePath } from 'next/cache'

import { requireSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { AppError, toUserMessage } from '@/lib/errors'
import { logger } from '@/lib/logger'
import type { NotificationCategory } from '@/types/domain'

/**
 * Liga ou desliga uma categoria de aviso.
 *
 * `requireSession` e não `requireStudentSession`: `notify_profiles` avisa aluno
 * e equipe pelo mesmo caminho, e a recepção tem o mesmo direito de silenciar.
 * A tela dela ainda não existe; a action já serve.
 *
 * O perfil não vai no corpo. Quem resolve é `set_notification_preference` pelo
 * `auth.uid()` — receber o perfil do cliente deixaria silenciar os avisos de
 * outra pessoa, que é um jeito calado de esconder cobrança de alguém.
 */
export async function definirPreferenciaDeAvisoAction(
  category: NotificationCategory,
  enabled: boolean,
): Promise<{ ok: boolean; erro?: string }> {
  try {
    await requireSession()
    const dataSource = await getDataSource()
    await dataSource.setNotificationPreference(category, enabled)
    logger.info('aviso:preferencia', { category, enabled })

    revalidatePath('/app/notifications')
    return { ok: true }
  } catch (error) {
    if (!(error instanceof AppError)) {
      logger.error('aviso:preferencia_falhou', { category, error: String(error) })
    }
    return { ok: false, erro: toUserMessage(error) }
  }
}
