import { getNotificationFeed } from '@/features/notifications/service'
import { NotificationsMenu } from '@/features/notifications/notifications-menu'
import { requireSession } from '@/lib/auth/require-session'

/**
 * Sino pronto para o cabeçalho: busca no servidor, entrega ao cliente.
 *
 * Fica no layout, então é renderizado em toda navegação do painel — o contador
 * nunca fica velho.
 */
export async function NotificationsBell({ allHref = '/notifications' }: { allHref?: string }) {
  const session = await requireSession()
  const feed = await getNotificationFeed(session)

  return <NotificationsMenu items={feed.items} unread={feed.unread} allHref={allHref} />
}
