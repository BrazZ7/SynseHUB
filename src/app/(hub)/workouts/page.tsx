import type { Metadata } from 'next'
import Link from 'next/link'
import { Dumbbell, Plus, Users } from 'lucide-react'

import { EmptyState } from '@/components/synse/empty-state'
import { PageHeader } from '@/components/synse/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { can } from '@/lib/permissions/permissions'
import { formatDate, formatNumber } from '@/lib/utils'

export const metadata: Metadata = { title: 'Treinos' }

export default async function WorkoutsPage() {
  const session = await requireHubSession('workouts:read')
  const dataSource = await getDataSource()

  const [plans, assignmentCounts, exercises] = await Promise.all([
    dataSource.listWorkoutPlans(session.organizationId),
    dataSource.countAssignments(session.organizationId),
    dataSource.listExercises(session.organizationId),
  ])

  const canWrite = can(session.role, 'workouts:write')

  return (
    <div className="space-y-5 animate-fade-in-up">
      <PageHeader
        title="Treinos"
        description={`Planos de treino da academia e biblioteca com ${formatNumber(exercises.length)} exercícios.`}
        actions={
          canWrite && (
            <Button asChild>
              <Link href="/workouts/new">
                <Plus className="size-4" />
                Novo treino
              </Link>
            </Button>
          )
        }
      />

      {plans.length === 0 ? (
        <EmptyState
          icon={Dumbbell}
          title="Nenhum treino criado ainda."
          description="Monte o primeiro plano de treino para atribuir aos alunos."
          action={
            canWrite && (
              <Button asChild>
                <Link href="/workouts/new">
                  <Plus className="size-4" />
                  Montar o primeiro treino
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {plans.map((plan) => (
            <Card key={plan.id} className="transition-shadow hover:shadow-synse">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <CardTitle>{plan.name}</CardTitle>
                  <Badge variant="primary">{plan.splitLabel}</Badge>
                </div>
                <p className="text-sm text-synse-muted">{plan.goal ?? 'Sem objetivo definido'}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm text-synse-muted">
                  <span className="flex items-center gap-1.5">
                    <Users className="size-4" aria-hidden />
                    {formatNumber(assignmentCounts[plan.id] ?? 0)} alunos
                  </span>
                  <span className="text-xs">Criado em {formatDate(plan.createdAt)}</span>
                </div>
                <Button variant="outline" size="sm" asChild className="w-full">
                  <Link href={`/workouts/${plan.id}`}>Ver exercícios</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
