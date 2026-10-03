import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { BackLink } from '@/components/synse/back-link'
import { WeighingScreen } from '@/features/synse-body/components/weighing-screen'
import { requireStudentSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { isPendingMigration } from '@/lib/database/pending-migration'
import type { UserDevice } from '@/types/domain'

export const metadata: Metadata = { title: 'Pesagem' }

export default async function PesarPage() {
  const session = await requireStudentSession()
  const dataSource = await getDataSource()

  let aparelhos: UserDevice[] = []
  try {
    aparelhos = await dataSource.listUserDevices()
  } catch (erro) {
    if (!isPendingMigration(erro)) throw erro
  }

  // Sem balança vinculada não há o que pesar: a tela de aparelhos é o começo.
  if (!aparelhos.length) redirect('/app/corpo/aparelhos')

  /*
   * A altura vem da última avaliação física, que é onde o Synse já a registra.
   * Sem ela o IMC não é calculado — e não é inventado a partir de uma altura
   * média, que produziria um número com cara de dado.
   */
  let alturaM: number | null = null
  try {
    const avaliacoes = await dataSource.listAssessments(session.organizationId, session.studentId)
    const comAltura = [...avaliacoes].reverse().find((a) => a.height != null)
    alturaM = comAltura?.height != null ? comAltura.height / 100 : null
  } catch (erro) {
    if (!isPendingMigration(erro)) throw erro
  }

  return (
    <div className="animate-fade-in-up space-y-5">
      <header>
        <BackLink href="/app/corpo" label="Synse Body" />
        <h1 className="mt-1 text-2xl font-semibold text-synse-text">Pesagem</h1>
      </header>

      <WeighingScreen
        aparelho={aparelhos[0]}
        heightM={alturaM}
        modoDemonstracao={dataSource.kind === 'demo'}
      />
    </div>
  )
}
