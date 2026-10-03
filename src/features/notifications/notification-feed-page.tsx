import { Bell, CheckCheck } from 'lucide-react'

import { EmptyState } from '@/components/synse/empty-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { markNotificationsReadAction } from '@/features/notifications/actions'
import { NotificationItem } from '@/features/notifications/notification-item'
import type { NotificationFeed } from '@/features/notifications/service'

/**
 * Lista completa dos avisos. Mesma peça no painel e no app do aluno — o que
 * muda é a casca da rota, não o conteúdo.
 */
export function NotificationFeedList({ feed }: { feed: NotificationFeed }) {
  if (feed.items.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={Bell}
            title="Nenhuma notificação ainda"
            description="Matrículas, cobranças, pagamentos e treinos novos aparecem aqui assim que acontecem."
          />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {feed.unread > 0 && (
        <form action={markNotificationsReadAction} className="flex justify-end">
          <Button type="submit" variant="outline" size="sm">
            <CheckCheck className="size-4" aria-hidden />
            Marcar {feed.unread} como {feed.unread === 1 ? 'lida' : 'lidas'}
          </Button>
        </form>
      )}

      <Card>
        <CardContent className="divide-y divide-synse-border p-2">
          {feed.items.map((notification) => (
            <NotificationItem key={notification.id} notification={notification} />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
