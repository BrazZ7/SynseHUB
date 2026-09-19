import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { BackLink } from '@/components/synse/back-link'
import { PageHeader } from '@/components/synse/page-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { NutritionPlanEditor } from '@/features/nutrition/plan-editor'
import { PlanActions } from '@/features/nutrition/plan-actions'
import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { formatDate, formatNumber } from '@/lib/utils'

export const metadata: Metadata = { title: 'Plano alimentar' }

type Params = Promise<{ id: string }>

export default async function NutritionPlanPage({ params }: { params: Params }) {
  const { id } = await params
  const session = await requireHubSession('nutrition:read')
  const dataSource = await getDataSource()

  const plano = await dataSource.getNutritionPlan(session.organizationId, id)
  if (!plano) notFound()

  const alunos = await dataSource.listStudents(session.organizationId, {
    status: 'ALL',
    page: 1,
    pageSize: 300,
  })

  const publicado = plano.status === 'PUBLISHED'

  return (
    <div className="mx-auto max-w-4xl space-y-5 animate-fade-in-up">
      <BackLink href="/nutrition" label="Nutrição" />

      <PageHeader
        title={plano.title}
        description={`${plano.studentName ?? 'Aluno'} · versão ${plano.version}${plano.authorName ? ` · ${plano.authorName}` : ''}`}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={publicado ? 'success' : plano.status === 'DRAFT' ? 'warning' : 'default'}>
          {publicado ? 'Publicado' : plano.status === 'DRAFT' ? 'Rascunho' : 'Arquivado'}
        </Badge>
        {plano.publishedAt && (
          <span className="text-xs text-synse-muted">
            Publicado em {formatDate(plano.publishedAt)}
          </span>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>O que o plano entrega</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Total rotulo="Calorias" valor={plano.totals.calories} alvo={plano.targetCalories} unidade="kcal" />
            <Total rotulo="Proteína" valor={plano.totals.proteinG} alvo={plano.targetProteinG} unidade="g" />
            <Total rotulo="Carboidrato" valor={plano.totals.carbsG} alvo={plano.targetCarbsG} unidade="g" />
            <Total rotulo="Gordura" valor={plano.totals.fatG} alvo={plano.targetFatG} unidade="g" />
          </dl>
          <p className="mt-4 text-xs text-synse-muted">
            Soma dos {plano.totals.items} itens prescritos. Item sem valor anotado não entra na
            conta — o total mostra o que foi de fato registrado.
          </p>
        </CardContent>
      </Card>

      <PlanActions planId={plano.id} status={plano.status} />

      {publicado ? (
        <Card>
          <CardHeader>
            <CardTitle>Refeições</CardTitle>
            <p className="text-sm text-synse-muted">
              Plano publicado não é editado: o aluno está seguindo ele hoje. Abra uma nova versão
              para alterar.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {plano.meals.map((refeicao) => (
              <div key={refeicao.id}>
                <h3 className="text-sm font-semibold text-synse-text">
                  {refeicao.name}
                  {refeicao.timeOfDay && (
                    <span className="ml-2 text-xs font-normal text-synse-muted">
                      {refeicao.timeOfDay}
                    </span>
                  )}
                </h3>
                <ul className="mt-1 space-y-1">
                  {refeicao.items.map((item) => (
                    <li key={item.id} className="flex justify-between gap-3 text-sm">
                      <span className="text-synse-text">
                        {item.description}
                        {item.quantity && (
                          <span className="text-synse-muted"> · {item.quantity}</span>
                        )}
                      </span>
                      {item.calories != null && (
                        <span className="shrink-0 tabular-nums text-synse-muted">
                          {item.calories} kcal
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {plano.notes && (
              <p className="border-t border-synse-border pt-3 text-sm text-synse-muted">
                {plano.notes}
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-5">
            <NutritionPlanEditor
              alunos={alunos.rows.map((aluno) => ({ id: aluno.id, name: aluno.name }))}
              plan={plano}
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function Total({
  rotulo,
  valor,
  alvo,
  unidade,
}: {
  rotulo: string
  valor: number
  alvo: number | null
  unidade: string
}) {
  return (
    <div>
      <dt className="text-xs text-synse-muted">{rotulo}</dt>
      <dd className="text-lg font-semibold tabular-nums text-synse-text">
        {formatNumber(Math.round(valor))}
        <span className="ml-1 text-xs font-normal text-synse-muted">{unidade}</span>
      </dd>
      {alvo != null && (
        <p className="text-xs text-synse-muted">meta {formatNumber(alvo)}</p>
      )}
    </div>
  )
}
