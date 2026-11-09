import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { BackLink } from '@/components/synse/back-link'
import { PageHeader } from '@/components/synse/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { NewWorkoutForm } from '@/features/workouts/new-workout-form'
import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'

type Params = Promise<{ id: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params
  const session = await requireHubSession('workouts:write')
  const dataSource = await getDataSource()
  const plan = await dataSource.getWorkoutPlan(session.organizationId, id)
  return { title: plan ? `Editar ${plan.name}` : 'Editar treino' }
}

/**
 * Edição de treino.
 *
 * `requireHubSession('workouts:write')` já na leitura da página: quem não pode
 * escrever não deve nem ver o formulário. A permissão é conferida de novo na
 * action, porque a tela só esconde — quem manda é o servidor.
 */
export default async function EditWorkoutPage({ params }: { params: Params }) {
  const { id } = await params
  const session = await requireHubSession('workouts:write')
  const dataSource = await getDataSource()

  const plan = await dataSource.getWorkoutPlan(session.organizationId, id)
  if (!plan) notFound()

  const [exercises, doTreino] = await Promise.all([
    dataSource.listExercises(session.organizationId),
    dataSource.listWorkoutExercises(plan.id),
  ])

  return (
    <div className="mx-auto max-w-3xl animate-fade-in-up space-y-5">
      <BackLink href={`/workouts/${plan.id}`} label={plan.name} />

      <PageHeader
        eyebrow={`Divisão ${plan.splitLabel}`}
        title={`Editar ${plan.name}`}
        description="A lista de exercícios é regravada inteira ao salvar. Quem já recebeu este treino passa a ver a versão nova no app."
      />

      <Card>
        <CardContent className="pt-5">
          <NewWorkoutForm
            exercises={exercises}
            treino={{
              id: plan.id,
              name: plan.name,
              goal: plan.goal,
              splitLabel: plan.splitLabel,
              exercises: doTreino.map((item) => ({
                exerciseId: item.exerciseId,
                sets: item.sets,
                reps: item.reps,
                restSeconds: item.restSeconds,
                suggestedLoad: item.suggestedLoad,
                notes: item.notes,
              })),
            }}
          />
        </CardContent>
      </Card>
    </div>
  )
}
