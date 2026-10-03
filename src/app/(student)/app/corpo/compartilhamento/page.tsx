import type { Metadata } from 'next'

import { BackLink } from '@/components/synse/back-link'
import { PageHeader } from '@/components/synse/page-header'
import { Compartilhamento } from '@/features/synse-body/compartilhamento'
import { requireStudentSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'

export const metadata: Metadata = { title: 'Quem vê o seu corpo' }

/**
 * A rota que as actions da 0032 já revalidavam e que não existia.
 *
 * `grantBodyShareAction` e `revokeBodyShareAction` apontam para
 * `/app/corpo/compartilhamento` desde que foram escritas. O caminho estava no
 * código e a página, não.
 */
export default async function CompartilhamentoPage() {
  await requireStudentSession()
  const dataSource = await getDataSource()

  const [autorizados, equipe] = await Promise.all([
    dataSource.listBodyShares(),
    dataSource.listStaffToAuthorize(),
  ])

  return (
    <div className="animate-fade-in-up space-y-5">
      <BackLink href="/app/corpo" label="Corpo" />
      <PageHeader
        title="Quem vê o seu corpo"
        description="Peso, gordura corporal e composição são seus. Aqui você decide quem mais enxerga."
      />

      <Compartilhamento autorizados={autorizados} equipe={equipe} />
    </div>
  )
}
