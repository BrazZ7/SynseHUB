import type { Metadata } from 'next'

import { AppBackLink } from '@/components/synse/app-back-link'
import { RunTracker } from '@/features/synse-run/components/run-tracker'
import { SPORT_LABELS } from '@/features/synse-run/format'
import type { SportType } from '@/features/synse-run/engine/types'
import { requireStudentSession } from '@/lib/auth/require-session'

export const metadata: Metadata = { title: 'Atividade' }

/** A tela roda inteira no cliente — GPS não existe no servidor. */
export const dynamic = 'force-dynamic'

function parseSport(valor: string | undefined): SportType {
  return valor === 'WALK' || valor === 'RIDE' ? valor : 'RUN'
}

export default async function StartActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ esporte?: string }>
}) {
  await requireStudentSession()
  const esporte = parseSport((await searchParams).esporte)

  return (
    <div className="animate-fade-in-up space-y-5">
      <header>
        <AppBackLink href="/app/run" label="SynseRun" />
        <h1 className="text-2xl font-semibold text-synse-text">{SPORT_LABELS[esporte]}</h1>
      </header>

      <RunTracker sport={esporte} />
    </div>
  )
}
