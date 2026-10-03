import Link from 'next/link'
import { Apple, FileText, Plus } from 'lucide-react'

import { EmptyState } from '@/components/synse/empty-state'
import { ListLink } from '@/components/synse/list-link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { dietasDoAluno } from '@/features/nutrition/state'
import { formatDate } from '@/lib/utils'
import type { NutritionPlan } from '@/types/domain'

/**
 * ── As dietas deste aluno ───────────────────────────────────────────────────
 *
 * A aba "Nutrição" da ficha era um `EmptyState` fixo: "Nenhum plano
 * nutricional publicado", escrito à mão e **sem nunca consultar nada**. Dizia
 * isso para o aluno que tinha três versões prescritas, e o nutricionista que
 * quisesse rever o que receitou em março precisava caçar na lista geral de
 * `/nutrition`, que mistura os planos da academia inteira.
 *
 * `listNutritionPlansForStudent` estava no data source desde a 0030 esperando
 * esta tela.
 *
 * ── Por que o histórico importa aqui ────────────────────────────────────────
 *
 * A página de nutrição já dizia a razão e não a cumpria: "num dado de saúde, o
 * que foi prescrito antes é o que importa quando alguém pergunta depois".
 * Versão arquivada não é lixo — é o registro de uma conduta, com autor e data,
 * e é o que o nutricionista precisa para explicar por que mudou.
 */
export function DietasDoAluno({
  planos,
  studentId,
  canWrite,
}: {
  planos: NutritionPlan[]
  studentId: string
  canWrite: boolean
}) {
  const { vigente, rascunho, anteriores } = dietasDoAluno(planos)

  if (planos.length === 0) {
    return (
      <EmptyState
        icon={Apple}
        title="Nenhum plano alimentar para este aluno"
        description="Planos individuais só podem ser publicados por nutricionista habilitado, com autoria, data e versão registradas."
        action={
          canWrite && (
            <Button asChild>
              <Link href={`/nutrition/new?aluno=${studentId}`}>
                <Plus className="size-4" aria-hidden />
                Montar o primeiro
              </Link>
            </Button>
          )
        }
      />
    )
  }

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="flex justify-end">
          <Button asChild>
            <Link href={`/nutrition/new?aluno=${studentId}`}>
              <Plus className="size-4" aria-hidden />
              Novo plano
            </Link>
          </Button>
        </div>
      )}

      {vigente ? (
        <PlanoEmDestaque plano={vigente} rotulo="Em vigor" tom="success" />
      ) : (
        <p className="rounded-xl border border-synse-warning/40 bg-synse-warning/5 p-3.5 text-sm text-synse-text">
          Nenhum plano publicado no momento — o aluno não vê dieta nenhuma no app.
          {rascunho && ' Há um rascunho em andamento abaixo.'}
        </p>
      )}

      {rascunho && <PlanoEmDestaque plano={rascunho} rotulo="Rascunho" tom="warning" />}

      {anteriores.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Versões anteriores</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-synse-border">
              {anteriores.map((plano) => (
                <li key={plano.id}>
                  <ListLink
                    href={`/nutrition/${plano.id}`}
                    className="flex items-center gap-3 py-2.5 transition-opacity hover:opacity-80"
                  >
                    <FileText className="size-4 shrink-0 text-synse-muted" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-synse-text">{plano.title}</span>
                      <span className="block truncate text-xs text-synse-muted">
                        Versão {plano.version}
                        {plano.authorName && ` · ${plano.authorName}`}
                        {plano.publishedAt && ` · publicado em ${formatDate(plano.publishedAt)}`}
                      </span>
                    </span>
                    <Badge variant="outline">
                      {plano.status === 'ARCHIVED' ? 'Arquivado' : 'Rascunho'}
                    </Badge>
                  </ListLink>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-synse-muted">
              Nada é apagado. Num dado de saúde, o que foi prescrito antes é o que importa quando
              alguém pergunta depois.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

/** O plano que a consulta de hoje usa: metas à vista, sem precisar abrir. */
function PlanoEmDestaque({
  plano,
  rotulo,
  tom,
}: {
  plano: NutritionPlan
  rotulo: string
  tom: 'success' | 'warning'
}) {
  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium text-synse-text">{plano.title}</p>
            <p className="text-xs text-synse-muted">
              Versão {plano.version}
              {plano.authorName && ` · ${plano.authorName}`}
              {plano.publishedAt && ` · publicado em ${formatDate(plano.publishedAt)}`}
            </p>
          </div>
          <Badge variant={tom}>{rotulo}</Badge>
        </div>

        {plano.targetCalories && (
          <p className="text-sm tabular-nums text-synse-text">
            Meta: {plano.targetCalories} kcal
            {plano.targetProteinG && ` · ${plano.targetProteinG} g proteína`}
            {plano.targetCarbsG && ` · ${plano.targetCarbsG} g carboidrato`}
            {plano.targetFatG && ` · ${plano.targetFatG} g gordura`}
          </p>
        )}

        {plano.notes && <p className="text-sm text-synse-muted">{plano.notes}</p>}

        <Button variant="outline" size="sm" asChild className="w-full sm:w-auto">
          <ListLink href={`/nutrition/${plano.id}`}>Abrir o plano</ListLink>
        </Button>
      </CardContent>
    </Card>
  )
}
