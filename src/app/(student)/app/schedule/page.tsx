import type { Metadata } from 'next'
import { CalendarDays } from 'lucide-react'

import { BackLink } from '@/components/synse/back-link'
import { EmptyState } from '@/components/synse/empty-state'
import { PageHeader } from '@/components/synse/page-header'
import { StudentSchedule } from '@/features/schedule/student-schedule'
import { agruparPorDia, chaveDoDia } from '@/features/schedule/week'
import { requireStudentSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'

export const metadata: Metadata = { title: 'Aulas' }

export default async function StudentSchedulePage() {
  const session = await requireStudentSession()
  const dataSource = await getDataSource()

  /*
   * Os próximos sete dias a partir de agora — não a semana do calendário. O
   * aluno quer saber o que vem, e numa sexta-feira a semana civil só teria dois
   * dias para mostrar.
   */
  const agora = new Date()
  const sessoes = await dataSource.listClassSessionsForStudent(
    session.organizationId,
    session.studentId,
    { from: agora.toISOString(), to: new Date(agora.getTime() + 7 * 86_400_000).toISOString() },
  )

  const porDia = agruparPorDia(sessoes)
  const dias = [...porDia.entries()].map(([chave, aulas]) => ({
    rotulo:
      chave === chaveDoDia(agora)
        ? 'Hoje'
        : new Date(`${chave}T12:00:00`).toLocaleDateString('pt-BR', {
            weekday: 'long',
            day: '2-digit',
            month: '2-digit',
          }),
    aulas: aulas as (typeof sessoes)[number][],
  }))

  return (
    <div className="space-y-5 animate-fade-in-up">
      <BackLink href="/app" label="Hoje" />

      <PageHeader
        title="Aulas"
        description="Os próximos sete dias. Reserve a vaga pelo app — turma cheia coloca você na lista de espera, e avisamos se alguém desmarcar."
      />

      {dias.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Nenhuma aula marcada"
          description="A academia ainda não publicou a grade desta semana."
        />
      ) : (
        <StudentSchedule dias={dias} />
      )}
    </div>
  )
}
