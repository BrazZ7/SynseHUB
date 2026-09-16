import type { Metadata } from 'next'
import Link from 'next/link'
import { Apple, Plus } from 'lucide-react'

import { EmptyState } from '@/components/synse/empty-state'
import { PageHeader } from '@/components/synse/page-header'
import { StudentAvatar } from '@/components/synse/student-avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { can } from '@/lib/permissions/permissions'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Nutrição' }

const ROTULO = { DRAFT: 'Rascunho', PUBLISHED: 'Publicado', ARCHIVED: 'Arquivado' } as const
const TOM = { DRAFT: 'warning', PUBLISHED: 'success', ARCHIVED: 'default' } as const

export default async function NutritionPage() {
  const session = await requireHubSession('nutrition:read')
  const dataSource = await getDataSource()
  const planos = await dataSource.listNutritionPlans(session.organizationId)

  const canWrite = can(session.role, 'nutrition:write')
  const vigentes = planos.filter((p) => p.status !== 'ARCHIVED')
  const arquivados = planos.filter((p) => p.status === 'ARCHIVED')

  return (
    <div className="space-y-5 animate-fade-in-up">
      <PageHeader
        title="Nutrição"
        description="Planos alimentares com responsável técnico. Só o publicado chega ao aluno — rascunho é trabalho em andamento."
        actions={
          canWrite && (
            <Button asChild>
              <Link href="/nutrition/new">
                <Plus className="size-4" />
                Novo plano
              </Link>
            </Button>
          )
        }
      />

      {planos.length === 0 ? (
        <EmptyState
          icon={Apple}
          title="Nenhum plano alimentar"
          description="Monte o primeiro plano. Ele fica como rascunho até você publicar, e o aluno recebe o aviso no app."
          action={
            canWrite && (
              <Button asChild>
                <Link href="/nutrition/new">
                  <Plus className="size-4" />
                  Montar o primeiro
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {vigentes.map((plano) => (
              <Card key={plano.id} className="transition-shadow hover:shadow-synse">
                <CardContent className="space-y-3 pt-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <StudentAvatar name={plano.studentName ?? 'Aluno'} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-synse-text">
                          {plano.studentName ?? 'Aluno'}
                        </p>
                        <p className="truncate text-xs text-synse-muted">{plano.title}</p>
                      </div>
                    </div>
                    <Badge variant={TOM[plano.status]}>{ROTULO[plano.status]}</Badge>
                  </div>

                  <p className="text-xs text-synse-muted">
                    Versão {plano.version}
                    {plano.authorName && ` · ${plano.authorName}`}
                    {plano.publishedAt && ` · publicado em ${formatDate(plano.publishedAt)}`}
                  </p>

                  {plano.targetCalories && (
                    <p className="text-sm tabular-nums text-synse-text">
                      Meta: {plano.targetCalories} kcal
                      {plano.targetProteinG && ` · ${plano.targetProteinG} g proteína`}
                    </p>
                  )}

                  <Button variant="outline" size="sm" asChild className="w-full">
                    <Link href={`/nutrition/${plano.id}`}>Abrir</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          {arquivados.length > 0 && (
            <p className="text-xs text-synse-muted">
              {arquivados.length} {arquivados.length === 1 ? 'versão arquivada' : 'versões arquivadas'}.
              O histórico fica: num dado de saúde, o que foi prescrito antes é o que importa quando
              alguém pergunta depois.
            </p>
          )}
        </>
      )}
    </div>
  )
}
