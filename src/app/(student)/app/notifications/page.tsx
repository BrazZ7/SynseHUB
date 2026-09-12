import type { Metadata } from 'next'

import { AppBackLink } from '@/components/synse/app-back-link'
import { NotificationFeedList } from '@/features/notifications/notification-feed-page'
import { getNotificationFeed } from '@/features/notifications/service'
import { requireStudentSession } from '@/lib/auth/require-session'

export const metadata: Metadata = { title: 'Notificações' }

export default async function StudentNotificationsPage() {
  const session = await requireStudentSession()
  const feed = await getNotificationFeed(session, 60)

  return (
    <div className="animate-fade-in-up space-y-5">
      <header>
        <AppBackLink href="/app" label="Hoje" />
        <h1 className="text-2xl font-semibold text-synse-text">Notificações</h1>
        <p className="text-sm text-synse-muted">Treinos, cobranças e avisos da sua academia.</p>
      </header>
      <NotificationFeedList feed={feed} />
    </div>
  )
}
