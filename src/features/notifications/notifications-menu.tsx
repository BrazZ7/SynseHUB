'use client'

import Link from 'next/link'
import { Bell, CheckCheck } from 'lucide-react'
import { useFormStatus } from 'react-dom'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { markNotificationsReadAction } from '@/features/notifications/actions'
import { NotificationItem } from '@/features/notifications/notification-item'
import type { AppNotification } from '@/types/domain'

type Props = {
  items: AppNotification[]
  unread: number
  /** Para onde vai o "ver todas": painel e app têm páginas diferentes. */
  allHref: string
}

/**
 * O sino.
 *
 * Só o gatilho e a lista são cliente; os dados chegam prontos do servidor. Não
 * há busca no navegador nem polling: o contador é recalculado a cada navegação,
 * que é o ritmo real com que uma academia usa o painel.
 */
export function NotificationsMenu({ items, unread, allHref }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={unread > 0 ? `Notificações: ${unread} não lidas` : 'Notificações'}
        >
          <Bell className="size-4" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-synse-primary px-1 text-[10px] font-semibold leading-4 text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-2">
        <div className="flex items-center justify-between gap-2 px-1 pb-1">
          <p className="text-sm font-semibold text-synse-text">Notificações</p>
          {unread > 0 && (
            <form action={markNotificationsReadAction}>
              <MarkAllButton />
            </form>
          )}
        </div>

        <DropdownMenuSeparator />

        {items.length === 0 ? (
          <p className="px-2.5 py-6 text-center text-sm text-synse-muted">
            Nada por aqui ainda. Matrículas, cobranças e treinos aparecem neste sino.
          </p>
        ) : (
          <div className="max-h-[22rem] space-y-0.5 overflow-y-auto">
            {items.map((notification) => (
              <NotificationItem key={notification.id} notification={notification} />
            ))}
          </div>
        )}

        <DropdownMenuSeparator />

        <Link
          href={allHref}
          className="block rounded-lg px-2.5 py-2 text-center text-sm text-synse-primary transition-colors hover:bg-synse-surface-2"
        >
          Ver todas
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function MarkAllButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="ghost" size="sm" disabled={pending} className="h-7 px-2">
      <CheckCheck className="size-3.5" aria-hidden />
      {pending ? 'Marcando…' : 'Marcar lidas'}
    </Button>
  )
}
