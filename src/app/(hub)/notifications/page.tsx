import type { Metadata } from 'next'

import { PageHeader } from '@/components/synse/page-header'
import { NotificationFeedList } from '@/features/notifications/notification-feed-page'
import { getNotificationFeed } from '@/features/notifications/service'
import { requireHubSession } from '@/lib/auth/require-session'

export const metadata: Metadata = { title: 'Notificações' }

export default async function NotificationsPage() {
  const session = await requireHubSession('notifications:read')
  const feed = await getNotificationFeed(session, 60)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notificações"
        description="Tudo que aconteceu na sua academia e na sua conta, em ordem."
      />
      <NotificationFeedList feed={feed} />
    </div>
  )
}
