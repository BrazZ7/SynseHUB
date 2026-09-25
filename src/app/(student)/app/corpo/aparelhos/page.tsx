import type { Metadata } from 'next'

import { BackLink } from '@/components/synse/back-link'
import { DevicesScreen } from '@/features/synse-body/components/devices-screen'
import { requireStudentSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { isPendingMigration } from '@/lib/database/pending-migration'
import type { UserDevice } from '@/types/domain'

export const metadata: Metadata = { title: 'Aparelhos' }

export default async function AparelhosPage() {
  await requireStudentSession()
  const dataSource = await getDataSource()

  let aparelhos: UserDevice[] = []
  try {
    aparelhos = await dataSource.listUserDevices()
  } catch (erro) {
    if (!isPendingMigration(erro)) throw erro
  }

  return (
    <div className="animate-fade-in-up space-y-5">
      <header>
        <BackLink href="/app/corpo" label="Synse Body" />
        <h1 className="mt-1 text-2xl font-semibold text-synse-text">Aparelhos</h1>
        <p className="text-sm text-synse-muted">
          As balanças vinculadas à sua conta. Sua academia não vê esta lista.
        </p>
      </header>

      <DevicesScreen aparelhos={aparelhos} modoDemonstracao={dataSource.kind === 'demo'} />
    </div>
  )
}
