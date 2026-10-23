import type { Metadata } from 'next'
import { History } from 'lucide-react'

import { BackLink } from '@/components/synse/back-link'
import { ColunaDeLeitura } from '@/components/synse/duas-colunas'
import { EmptyState } from '@/components/synse/empty-state'
import { PageHeader } from '@/components/synse/page-header'
import { Historico } from '@/features/students/historico/historico'
import { requireStudentSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { seAindaNaoMigrou } from '@/lib/database/pending-migration'

export const metadata: Metadata = { title: 'Histórico' }

/**
 * O histórico integrado.
 *
 * Vinte por página: cabe numa rolagem de celular sem o botão de carregar mais
 * aparecer antes de a pessoa ter lido alguma coisa.
 */
const POR_PAGINA = 20

export default async function HistoricoPage() {
  const session = await requireStudentSession()
  const dataSource = await getDataSource()

  const [entradas, organizacao] = await Promise.all([
    /*
     * `seAindaNaoMigrou` porque a 0064 pode não ter sido colada ainda. Lista
     * vazia é o estado honesto nesse intervalo: a tela diz "nada ainda", que
     * é melhor que uma página de erro por causa de uma função que não existe.
     */
    dataSource.listStudentTimeline(POR_PAGINA).catch(seAindaNaoMigrou([])),
    /*
     * O fuso da academia decide o dia civil de cada acontecimento. Sem ele o
     * servidor agruparia em UTC, e todo evento depois das 21h apareceria no
     * dia seguinte — o mesmo defeito que a sequência de treinos já teve.
     */
    dataSource.getOrganization(session.organizationId),
  ])

  return (
    <ColunaDeLeitura className="space-y-4">
      <BackLink href="/app/progress" label="Progresso" />
      <PageHeader
        title="Seu histórico"
        description="Treino, corrida, presença e pesagem, na ordem em que aconteceram."
      />

      {entradas.length === 0 ? (
        <EmptyState
          icon={History}
          title="Nada por aqui ainda"
          description="Quando você treinar, correr ou se pesar, tudo aparece nesta linha do tempo."
        />
      ) : (
        <Historico
          inicial={entradas}
          porPagina={POR_PAGINA}
          fuso={organizacao?.timezone ?? 'America/Sao_Paulo'}
        />
      )}
    </ColunaDeLeitura>
  )
}
