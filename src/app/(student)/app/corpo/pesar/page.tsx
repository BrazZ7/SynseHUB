import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { BackLink } from '@/components/synse/back-link'
import { WeighingScreen } from '@/features/synse-body/components/weighing-screen'
import { requireStudentSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { isPendingMigration } from '@/lib/database/pending-migration'
import type { UserDevice } from '@/types/domain'
import { ColunaDeLeitura } from '@/components/synse/duas-colunas'

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
    /*
     * Uma linha, e não o histórico inteiro.
     *
     * A tela lia todas as avaliações do aluno para achar a altura mais
     * recente — um `reverse().find()` sobre uma leitura sem teto, numa tela
     * que abre toda vez que alguém vai se pesar. `comAltura` + `limite: 1`
     * pedem exatamente isso ao banco.
     */
    const [comAltura] = await dataSource.listAssessments(
      session.organizationId,
      session.studentId,
      { comAltura: true, limite: 1 },
    )
    alturaM = comAltura?.height != null ? comAltura.height / 100 : null
  } catch (erro) {
    if (!isPendingMigration(erro)) throw erro
  }

  return (
    <ColunaDeLeitura className="animate-fade-in-up space-y-5">
      <header>
        <BackLink href="/app/corpo" label="Synse Body" />
        <h1 className="mt-1 text-2xl font-semibold text-synse-text">Pesagem</h1>
      </header>

      <WeighingScreen
        aparelho={aparelhos[0]}
        heightM={alturaM}
        modoDemonstracao={dataSource.kind === 'demo'}
      />
    </ColunaDeLeitura>
  )
}
