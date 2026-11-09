import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { BackLink } from '@/components/synse/back-link'
import { PageHeader } from '@/components/synse/page-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { GymChallengeForm } from '@/features/gym-challenges/challenge-form'
import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { formatDate, formatNumber } from '@/lib/utils'

export const metadata: Metadata = { title: 'Desafio' }

type Params = Promise<{ id: string }>

export default async function ChallengePage({ params }: { params: Params }) {
  const { id } = await params
  const session = await requireHubSession('challenges:write')
  const dataSource = await getDataSource()

  const desafio = await dataSource.getGymChallenge(session.organizationId, id)
  if (!desafio) notFound()

  const ranking = desafio.rankingEnabled ? await dataSource.getGymChallengeRanking(id) : []

  return (
    <div className="mx-auto max-w-2xl space-y-5 animate-fade-in-up">
      <BackLink href="/challenges" label="Desafios" />
      <PageHeader
        title={desafio.title}
        description={`${formatNumber(desafio.participants)} participando · ${formatDate(desafio.startsAt)} a ${formatDate(desafio.endsAt)}`}
      />

      {desafio.rankingEnabled && (
        <Card>
          <CardHeader>
            <CardTitle>Ranking</CardTitle>
            <p className="text-sm text-synse-muted">
              Só quem consentiu aparece aqui. Quem não marcou participa do desafio do mesmo jeito.
            </p>
          </CardHeader>
          <CardContent>
            {ranking.length === 0 ? (
              <p className="py-4 text-center text-sm text-synse-muted">
                Ninguém consentiu em aparecer ainda.
              </p>
            ) : (
              <ol className="divide-y divide-synse-border">
                {ranking.map((linha) => (
                  <li key={`${linha.position}-${linha.name}`} className="flex items-center gap-3 py-2.5">
                    <span className="w-6 text-sm font-semibold tabular-nums text-synse-muted">
                      {linha.position}º
                    </span>
                    <span className="flex-1 truncate text-sm text-synse-text">{linha.name}</span>
                    {linha.completedAt && <Badge variant="success">Bateu a meta</Badge>}
                    <span className="text-sm font-semibold tabular-nums text-synse-primary">
                      {formatNumber(linha.progressValue)} {desafio.unit}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-5">
          <GymChallengeForm
            hoje={new Date().toISOString().slice(0, 10)}
            challenge={desafio}
          />
        </CardContent>
      </Card>
    </div>
  )
}
