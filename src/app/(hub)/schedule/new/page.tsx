import type { Metadata } from 'next'

import { BackLink } from '@/components/synse/back-link'
import { PageHeader } from '@/components/synse/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { ClassScheduleForm } from '@/features/schedule/class-schedule-form'
import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'

export const metadata: Metadata = { title: 'Nova aula' }

export default async function NewClassSchedulePage() {
  const session = await requireHubSession('schedule:write')
  const dataSource = await getDataSource()
  const staff = await dataSource.listStaff(session.organizationId)

  const professores = staff
    .filter((membro) => membro.role === 'TRAINER' || membro.role === 'PROFESSIONAL')
    .map((membro) => ({ id: membro.id, name: membro.name }))

  return (
    <div className="mx-auto max-w-3xl space-y-5 animate-fade-in-up">
      <BackLink href="/schedule" label="Agenda" />

      <PageHeader
        title="Nova aula"
        description="A regra é semanal: cadastre uma vez e as ocorrências das próximas três semanas são criadas na hora. Cancelar um dia depois não derruba a série."
      />

      <Card>
        <CardContent className="pt-5">
          <ClassScheduleForm professores={professores} hoje={new Date().toISOString().slice(0, 10)} />
        </CardContent>
      </Card>
    </div>
  )
}
