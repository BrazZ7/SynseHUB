import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { BackLink } from '@/components/synse/back-link'
import { PageHeader } from '@/components/synse/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { LeadForm } from '@/features/crm/lead-form'
import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'

/**
 * Editar o lead.
 *
 * `LeadForm` já recebia um `lead` para preencher e `saveLeadAction` já tratava
 * o `leadId` — faltava a rota. Quem errava o telefone no cadastro não tinha
 * como corrigir, e a recepção ligava para o número errado até alguém
 * cadastrar a mesma pessoa de novo.
 */
export const metadata: Metadata = { title: 'Editar lead' }

type Params = Promise<{ id: string }>

export default async function EditLeadPage({ params }: { params: Params }) {
  const { id } = await params
  const session = await requireHubSession('crm:write')
  const dataSource = await getDataSource()

  const [lead, staff] = await Promise.all([
    dataSource.getLead(session.organizationId, id),
    dataSource.listStaff(session.organizationId),
  ])
  if (!lead) notFound()

  return (
    <div className="mx-auto max-w-2xl animate-fade-in-up space-y-5">
      <BackLink href={`/crm/${lead.id}`} label={lead.name} />

      <PageHeader
        title="Editar lead"
        description="Corrige o contato, o responsável e a data de retorno. A etapa muda pelo funil, e o histórico guarda cada passagem."
      />

      <Card>
        <CardContent className="pt-5">
          <LeadForm responsaveis={staff.map((m) => ({ id: m.id, name: m.name }))} lead={lead} />
        </CardContent>
      </Card>
    </div>
  )
}
