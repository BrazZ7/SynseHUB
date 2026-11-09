import type { Metadata } from 'next'

import { BackLink } from '@/components/synse/back-link'
import { NotificationFeedList } from '@/features/notifications/notification-feed-page'
import { PreferenciasDeAviso } from '@/features/notifications/preferencias-de-aviso'
import { getNotificationFeed } from '@/features/notifications/service'
import { getDataSource } from '@/lib/database'
import { seAindaNaoMigrou } from '@/lib/database/pending-migration'
import { requireStudentSession } from '@/lib/auth/require-session'
import { ColunaDeLeitura } from '@/components/synse/duas-colunas'

export const metadata: Metadata = { title: 'Notificações' }

export default async function StudentNotificationsPage() {
  const session = await requireStudentSession()
  const [feed, preferencias] = await Promise.all([
    getNotificationFeed(session, 60),
    /*
     * `seAindaNaoMigrou` porque a 0065 pode não ter sido colada ainda. Lista
     * vazia é o estado honesto nesse intervalo: ausência é ligado, então a
     * tela mostra tudo ligado — que é exatamente o que o banco está fazendo.
     */
    getDataSource().then((dataSource) =>
      dataSource.listNotificationPreferences(session.userProfileId).catch(seAindaNaoMigrou([])),
    ),
  ])

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
      {/*
       * Antes do feed, e fechado: é a pergunta que alguém faz **ao abrir** a
       * central depois de receber um aviso que não queria. Embaixo de
       * sessenta avisos, ninguém acha.
       */}
      <PreferenciasDeAviso preferencias={preferencias} />

      <NotificationFeedList feed={feed} />
    </ColunaDeLeitura>
  )
}
