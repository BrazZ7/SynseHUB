import type { Metadata } from 'next'

import { BackLink } from '@/components/synse/back-link'
import { PageHeader } from '@/components/synse/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { NewClassScheduleForm } from '@/features/schedule/new-class-schedule-form'
import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { ROLE_LABELS } from '@/lib/permissions/permissions'

export const metadata: Metadata = { title: 'Nova aula' }

const DIA_LOCAL = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' })

export default async function NewSchedulePage() {
  const session = await requireHubSession('schedule:write')
  const dataSource = await getDataSource()
  const staff = await dataSource.listStaff(session.organizationId).catch(() => [])

  return (
    <div className="mx-auto max-w-3xl space-y-5 animate-fade-in-up">
      <BackLink href="/schedule" label="Agenda" />

      <PageHeader
        title="Nova aula"
        description="Cadastre a regra semanal e gere as primeiras ocorrências da agenda. Cancelar um dia depois não apaga a série inteira."
      />

      <Card>
        <CardContent className="pt-5">
          <NewClassScheduleForm
            defaultStartsOn={DIA_LOCAL.format(new Date())}
            staff={staff.map((member) => ({
              id: member.id,
              name: member.name,
              role: ROLE_LABELS[member.role],
            }))}
          />
        </CardContent>
      </Card>
    </div>
  )
}
