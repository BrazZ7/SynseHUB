import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { BackLink } from '@/components/synse/back-link'
import { PageHeader } from '@/components/synse/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { ClassScheduleForm } from '@/features/schedule/class-schedule-form'
import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { DIAS_DA_SEMANA } from '@/lib/validations/schedule'

export const metadata: Metadata = { title: 'Editar aula' }

type Params = Promise<{ id: string }>

export default async function EditClassSchedulePage({ params }: { params: Params }) {
  const { id } = await params
  const session = await requireHubSession('schedule:write')
  const dataSource = await getDataSource()

  const [schedule, staff] = await Promise.all([
    dataSource.getClassSchedule(session.organizationId, id),
    dataSource.listStaff(session.organizationId),
  ])

  if (!schedule) notFound()

  const professores = staff
    .filter((membro) => membro.role === 'TRAINER' || membro.role === 'PROFESSIONAL')
    .map((membro) => ({ id: membro.id, name: membro.name }))

  return (
    <div className="mx-auto max-w-3xl space-y-5 animate-fade-in-up">
      <BackLink href="/schedule" label="Agenda" />

      <PageHeader
        title={schedule.name}
        description={`${DIAS_DA_SEMANA[schedule.weekday]}, ${schedule.startTime}. Mudar a grade vale para as próximas aulas — as já criadas continuam como estão, porque carregam a presença de quem esteve lá.`}
      />

      <Card>
        <CardContent className="pt-5">
          <ClassScheduleForm
            professores={professores}
            hoje={new Date().toISOString().slice(0, 10)}
            schedule={schedule}
          />
        </CardContent>
      </Card>
    </div>
  )
}
