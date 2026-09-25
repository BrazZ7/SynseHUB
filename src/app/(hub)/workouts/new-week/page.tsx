import type { Metadata } from 'next'

import { BackLink } from '@/components/synse/back-link'
import { PageHeader } from '@/components/synse/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { WeekForm } from '@/features/workouts/week-form'
import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'

export const metadata: Metadata = { title: 'Montar a semana' }

export default async function NewWeekPage() {
  const session = await requireHubSession('workouts:write')
  const dataSource = await getDataSource()
  const exercises = await dataSource.listExercises(session.organizationId)

  return (
    <div className="mx-auto max-w-3xl animate-fade-in-up space-y-5">
      <BackLink href="/workouts" label="Treinos" />

      <PageHeader
        title="Montar a semana"
        description="Descreva os dias de uma vez. Cada dia vira um treino da academia, e a atribuição a cada aluno continua sendo feita treino a treino — é ela que faz o aviso chegar no app."
      />

      <Card>
        <CardContent className="pt-5">
          <WeekForm exercises={exercises} />
        </CardContent>
      </Card>
    </div>
  )
}
