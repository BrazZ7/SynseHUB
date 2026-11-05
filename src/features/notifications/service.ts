import 'server-only'

import { getDataSource } from '@/lib/database'
import { logger } from '@/lib/logger'
import type { SessionContext } from '@/lib/auth/session'
import type { AppNotification } from '@/types/domain'

export type NotificationFeed = {
  items: AppNotification[]
  unread: number
}

const EMPTY: NotificationFeed = { items: [], unread: 0 }

/**
 * Avisos da pessoa autenticada.
 *
 * Nunca derruba a página. O sino fica no cabeçalho de todas as telas do
 * painel: uma consulta que falhe aqui levaria junto o painel inteiro, e um
 * aviso perdido é menos grave que um dashboard em branco.
 */
export async function getNotificationFeed(
  session: SessionContext,
  limit = 12,
): Promise<NotificationFeed> {
  try {
    const dataSource = await getDataSource()
    const [items, unread] = await Promise.all([
      dataSource.listNotifications(session.userProfileId, limit),
      dataSource.countUnreadNotifications(session.userProfileId),
    ])
    return { items, unread }
  } catch (error) {
    logger.warn('notifications:read_failed', { error: String(error).slice(0, 200) })
    return EMPTY
  }
}
