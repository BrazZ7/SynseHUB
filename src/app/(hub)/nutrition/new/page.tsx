import type { Metadata } from 'next'

import { BackLink } from '@/components/synse/back-link'
import { PageHeader } from '@/components/synse/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { NutritionPlanEditor } from '@/features/nutrition/plan-editor'
import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'

export const metadata: Metadata = { title: 'Novo plano alimentar' }

export default async function NewNutritionPlanPage() {
  const session = await requireHubSession('nutrition:write')
  const dataSource = await getDataSource()
  const alunos = await dataSource.listStudents(session.organizationId, {
    status: 'ACTIVE',
    page: 1,
    pageSize: 300,
  })

  return (
    <div className="mx-auto max-w-4xl space-y-5 animate-fade-in-up">
      <BackLink href="/nutrition" label="Nutrição" />
      <PageHeader
        title="Novo plano alimentar"
        description="Salva como rascunho. O aluno só enxerga depois que você publicar — plano meio escrito no app é pior que nenhum."
      />
      <Card>
        <CardContent className="pt-5">
          <NutritionPlanEditor
            alunos={alunos.rows.map((aluno) => ({ id: aluno.id, name: aluno.name }))}
          />
        </CardContent>
      </Card>
    </div>
  )
}
