import type { Metadata } from 'next'

import { BackLink } from '@/components/synse/back-link'
import { PageHeader } from '@/components/synse/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { NewWorkoutForm } from '@/features/workouts/new-workout-form'
import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'

export const metadata: Metadata = { title: 'Novo treino' }

export default async function NewWorkoutPage() {
  const session = await requireHubSession('workouts:write')
  const dataSource = await getDataSource()
  const exercises = await dataSource.listExercises(session.organizationId)

  return (
    <div className="mx-auto max-w-3xl space-y-5 animate-fade-in-up">
      <BackLink href="/workouts" label="Treinos" />

      <PageHeader
        title="Novo treino"
        description="Monte a sequência com os exercícios da biblioteca. Depois de criado, o treino é atribuído a um aluno — e é a atribuição que faz o aviso chegar no app dele."
      />

      <Card>
        <CardContent className="pt-5">
          <NewWorkoutForm exercises={exercises} />
        </CardContent>
      </Card>
    </div>
  )
}
