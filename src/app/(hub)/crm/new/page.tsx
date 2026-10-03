import type { Metadata } from 'next'

import { BackLink } from '@/components/synse/back-link'
import { PageHeader } from '@/components/synse/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { LeadForm } from '@/features/crm/lead-form'
import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'

export const metadata: Metadata = { title: 'Novo lead' }

export default async function NewLeadPage() {
  const session = await requireHubSession('crm:write')
  const dataSource = await getDataSource()
  const staff = await dataSource.listStaff(session.organizationId)

  return (
    <div className="mx-auto max-w-2xl space-y-5 animate-fade-in-up">
      <BackLink href="/crm" label="CRM" />

      <PageHeader
        title="Novo lead"
        description="Quem pediu informação e ainda não é aluno. Marcar a data de retorno é o que faz o lead ser trabalhado em vez de esfriar."
      />

      <Card>
        <CardContent className="pt-5">
          <LeadForm responsaveis={staff.map((m) => ({ id: m.id, name: m.name }))} />
        </CardContent>
      </Card>
    </div>
  )
}
