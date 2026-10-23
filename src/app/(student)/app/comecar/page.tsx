import type { Metadata } from 'next'

import { BackLink } from '@/components/synse/back-link'
import { ColunaDeLeitura } from '@/components/synse/duas-colunas'
import { EntradaGuiada } from '@/features/students/entrada/entrada-guiada'
import { requireStudentSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { seAindaNaoMigrou } from '@/lib/database/pending-migration'

export const metadata: Metadata = { title: 'Vamos começar' }

/**
 * A entrada guiada.
 *
 * Alcançada de dois jeitos: pela porta do `/app`, na primeira abertura, e pela
 * mão de quem quer corrigir o que respondeu — e por isso a tela reabre com as
 * respostas marcadas em vez de começar do zero.
 */
export default async function ComecarPage() {
  const session = await requireStudentSession()
  const dataSource = await getDataSource()

  /*
   * `seAindaNaoMigrou` porque a 0063 pode não ter sido colada ainda: a Vercel
   * publica no push e o SQL vai à mão. Sem isto, a tela quebraria em vez de
   * aparecer em branco — e ela é a primeira coisa que o aluno novo vê.
   */
  const intake = await dataSource
    .getStudentIntake(session.studentId)
    .catch(seAindaNaoMigrou(null))

  return (
    <ColunaDeLeitura className="space-y-4">
      <BackLink href="/app" label="Hoje" />
      <EntradaGuiada intake={intake} />
    </ColunaDeLeitura>
  )
}
