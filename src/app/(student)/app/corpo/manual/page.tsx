import type { Metadata } from 'next'

import { BackLink } from '@/components/synse/back-link'
import { ManualEntry } from '@/features/synse-body/components/manual-entry'
import { requireStudentSession } from '@/lib/auth/require-session'

export const metadata: Metadata = { title: 'Digitar peso' }

export default async function EntradaManualPage() {
  await requireStudentSession()

  return (
    <div className="animate-fade-in-up space-y-5">
      <header>
        <BackLink href="/app/corpo" label="Synse Body" />
        <h1 className="mt-1 text-2xl font-semibold text-synse-text">Digitar peso</h1>
        <p className="text-sm text-synse-muted">
          Para quando a balança inteligente não está por perto.
        </p>
      </header>

      <ManualEntry />
    </div>
  )
}
