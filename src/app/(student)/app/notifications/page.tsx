import type { Metadata } from 'next'

import { BackLink } from '@/components/synse/back-link'
import { NotificationFeedList } from '@/features/notifications/notification-feed-page'
import { getNotificationFeed } from '@/features/notifications/service'
import { requireStudentSession } from '@/lib/auth/require-session'
import { ColunaDeLeitura } from '@/components/synse/duas-colunas'

export const metadata: Metadata = { title: 'Notificações' }

export default async function StudentNotificationsPage() {
  const session = await requireStudentSession()
  const feed = await getNotificationFeed(session, 60)

  return (
    /*
      Feed, e feed é cronologia: em duas colunas a linha do tempo ziguezagueia
      da esquerda para a direita e de volta, e "há 2 meses" acaba ao lado de
      "em 21 dias". Fica numa coluna só, presa na largura de leitura — a casca
      vai a 1024px porque **duas** colunas cabem lá, e uma lista sozinha nessa
      largura vira linha esticada com vazio à direita.
    */
    <ColunaDeLeitura className="animate-fade-in-up space-y-5">
      <header>
        <BackLink href="/app" label="Hoje" />
        <h1 className="text-2xl font-semibold text-synse-text">Notificações</h1>
        <p className="text-sm text-synse-muted">Treinos, cobranças e avisos da sua academia.</p>
      </header>
      <NotificationFeedList feed={feed} />
    </ColunaDeLeitura>
  )
}
