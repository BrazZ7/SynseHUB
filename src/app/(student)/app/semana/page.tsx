import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, CalendarRange } from 'lucide-react'

import { BackLink } from '@/components/synse/back-link'
import { ColunaDeLeitura } from '@/components/synse/duas-colunas'
import { EmptyState } from '@/components/synse/empty-state'
import { PageHeader } from '@/components/synse/page-header'
import { RegistrarVisita } from '@/features/analytics/registrar-visita'
import { ResumoDaSemana } from '@/features/students/resumo-da-semana'
import { requireStudentSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { seAindaNaoMigrou } from '@/lib/database/pending-migration'

export const metadata: Metadata = { title: 'Sua semana' }

/**
 * Duas semanas: esta e a anterior.
 *
 * O resumo compara com a semana passada, e mais que isso é série — que é
 * trabalho do gráfico de progresso, não deste cartão. O banco aceita até doze.
 */
const SEMANAS = 2

/**
 * O intervalo da semana em texto: "27/10 a 02/11".
 *
 * Montado da string 'YYYY-MM-DD' e não de um `Date` convertido: `new Date` numa
 * data sem hora a coloca em meia-noite UTC, e formatar isso no fuso de Brasília
 * mostra o **dia anterior**. O resumo da semana inteira ficaria um dia
 * deslocado — o erro mais fácil de não notar nesta tela.
 */
function intervaloDaSemana(weekStart: string): string {
  const [ano, mes, dia] = weekStart.split('-').map(Number)
  const segunda = new Date(Date.UTC(ano, mes - 1, dia))
  const domingo = new Date(segunda)
  domingo.setUTCDate(domingo.getUTCDate() + 6)

  const curto = (d: Date) =>
    `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`

  return `${curto(segunda)} a ${curto(domingo)}`
}

export default async function SemanaPage() {
  await requireStudentSession()
  const dataSource = await getDataSource()

  /*
   * `seAindaNaoMigrou` porque a 0066 pode não ter sido colada ainda. Lista
   * vazia leva ao estado vazio desta tela, que explica o que vai aparecer —
   * melhor que uma página de erro por causa de uma função que não existe.
   */
  const semanas = await dataSource
    .listStudentWeekSummary(SEMANAS)
    .catch(seAindaNaoMigrou([]))

  const [atual, anterior] = semanas

  return (
    <ColunaDeLeitura className="animate-fade-in-up space-y-4">
      <RegistrarVisita nome="RESUMO_CONSULTADO" rotulo="SEMANA" />

      <BackLink href="/app/progress" label="Progresso" />
      <PageHeader
        title="Sua semana"
        description="De segunda a domingo, com a semana passada ao lado para dar escala."
      />

      {atual ? (
        <ResumoDaSemana
          semana={atual}
          anterior={anterior ?? null}
          intervalo={intervaloDaSemana(atual.weekStart)}
        />
      ) : (
        <EmptyState
          icon={CalendarRange}
          title="O resumo aparece aqui"
          description="Assim que você treinar, correr ou registrar presença, esta tela fecha a semana e compara com a anterior."
        />
      )}

      {/*
        A porta para o item a item. O resumo responde "a semana valeu"; quem
        quer saber **qual** treino foi em qual dia vai para o histórico.
      */}
      <Link
        href="/app/historico"
        className="flex items-center justify-between rounded-2xl border border-synse-border bg-synse-surface p-4 text-sm text-synse-text shadow-synse-sm transition-colors hover:bg-synse-surface-2"
      >
        Ver o histórico, dia por dia
        <ArrowRight className="size-4 text-synse-muted" aria-hidden />
      </Link>
    </ColunaDeLeitura>
  )
}
