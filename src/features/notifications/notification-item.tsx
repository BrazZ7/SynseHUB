import Link from 'next/link'
import { BadgeDollarSign, Bell, Building2, Dumbbell, Sparkles, Trophy } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { AppNotification, NotificationCategory } from '@/types/domain'

const ICONS: Record<NotificationCategory, typeof Bell> = {
  PAYMENT: BadgeDollarSign,
  WORKOUT: Dumbbell,
  GYM: Building2,
  CONTENT: Sparkles,
  PROGRAM: Trophy,
  SYSTEM: Bell,
}

/**
 * Há quanto tempo, em português e sem biblioteca.
 *
 * `Intl.RelativeTimeFormat` já faz o plural e a concordância; o que falta é
 * escolher a unidade, e isso é uma escada de quatro degraus.
 */
export function timeAgo(iso: string, now = new Date()): string {
  const seconds = Math.round((new Date(iso).getTime() - now.getTime()) / 1000)
  const format = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })
  const absolute = Math.abs(seconds)

  if (absolute < 60) return 'agora'
  if (absolute < 3600) return format.format(Math.round(seconds / 60), 'minute')
  if (absolute < 86400) return format.format(Math.round(seconds / 3600), 'hour')
  if (absolute < 2592000) return format.format(Math.round(seconds / 86400), 'day')
  return format.format(Math.round(seconds / 2592000), 'month')
}

/**
 * Uma linha do sino.
 *
 * Sem `'use client'`: é usada tanto pelo menu (cliente) quanto pela página
 * (servidor). Um componente sem estado atende os dois.
 */
export function NotificationItem({ notification }: { notification: AppNotification }) {
  const Icon = ICONS[notification.category] ?? Bell
  const unread = notification.readAt === null

  const content = (
    <div className="flex items-start gap-3">
      <span
        className={cn(
          'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full',
          unread ? 'bg-synse-primary/15 text-synse-primary' : 'bg-synse-surface-2 text-synse-muted',
        )}
      >
        <Icon className="size-4" aria-hidden />
      </span>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'truncate text-sm',
            unread ? 'font-medium text-synse-text' : 'text-synse-text',
          )}
        >
          {notification.title}
        </p>
        {notification.body && (
          <p className="mt-0.5 line-clamp-2 text-xs text-synse-muted">{notification.body}</p>
        )}
        <p className="mt-1 text-[11px] text-synse-muted">{timeAgo(notification.createdAt)}</p>
      </div>

      {unread && (
        <span
          aria-label="Não lida"
          className="mt-2 size-2 shrink-0 rounded-full bg-synse-primary"
        />
      )}
    </div>
  )

  if (!notification.actionUrl) {
    return <div className="rounded-lg px-2.5 py-2.5">{content}</div>
  }

  return (
    <Link
      href={notification.actionUrl}
      className="block rounded-lg px-2.5 py-2.5 transition-colors hover:bg-synse-surface-2"
    >
      {content}
    </Link>
  )
}
