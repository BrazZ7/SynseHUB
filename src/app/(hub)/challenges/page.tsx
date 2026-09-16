import type { Metadata } from 'next'
import Link from 'next/link'
import { Eye, EyeOff, Plus, Trophy, Users } from 'lucide-react'

import { EmptyState } from '@/components/synse/empty-state'
import { PageHeader } from '@/components/synse/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { can } from '@/lib/permissions/permissions'
import { METRICAS } from '@/lib/validations/gym-challenge'
import { formatDate, formatNumber } from '@/lib/utils'

export const metadata: Metadata = { title: 'Desafios' }

export default async function ChallengesPage() {
  const session = await requireHubSession('challenges:read')
  const dataSource = await getDataSource()
  const desafios = await dataSource.listGymChallenges(session.organizationId)

  const canWrite = can(session.role, 'challenges:write')
  const hoje = new Date().toISOString().slice(0, 10)
  const ativos = desafios.filter((d) => d.status === 'ACTIVE' && d.endsAt >= hoje)
  const encerrados = desafios.filter((d) => d.status !== 'ACTIVE' || d.endsAt < hoje)

  return (
    <div className="space-y-5 animate-fade-in-up">
      <PageHeader
        title="Desafios"
        description="Metas da academia, contadas pelo sistema. O aluno não digita progresso — ele vem do check-in, do treino e da chamada."
        actions={
          canWrite && (
            <Button asChild>
              <Link href="/challenges/new">
                <Plus className="size-4" />
                Novo desafio
              </Link>
            </Button>
          )
        }
      />

      {desafios.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="Nenhum desafio ainda"
          description="Crie a primeira meta do mês. O progresso é contado sozinho, pelo que já acontece na academia."
          action={
            canWrite && (
              <Button asChild>
                <Link href="/challenges/new">
                  <Plus className="size-4" />
                  Criar o primeiro
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {ativos.map((desafio) => (
              <CartaoDesafio key={desafio.id} desafio={desafio} editavel={canWrite} />
            ))}
          </div>

          {encerrados.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-synse-muted">Encerrados e rascunhos</h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {encerrados.map((desafio) => (
                  <CartaoDesafio key={desafio.id} desafio={desafio} editavel={canWrite} apagado />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

function CartaoDesafio({
  desafio,
  editavel,
  apagado,
}: {
  desafio: Awaited<ReturnType<Awaited<ReturnType<typeof getDataSource>>['listGymChallenges']>>[number]
  editavel: boolean
  apagado?: boolean
}) {
  const metrica = METRICAS[desafio.metric]

  return (
    <Card className={apagado ? 'opacity-70' : 'transition-shadow hover:shadow-synse'}>
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-synse-text">{desafio.title}</h3>
            <p className="text-xs text-synse-muted">
              {formatDate(desafio.startsAt)} a {formatDate(desafio.endsAt)}
            </p>
          </div>
          {desafio.status === 'DRAFT' ? (
            <Badge variant="warning">Rascunho</Badge>
          ) : (
            <Badge variant="primary">{metrica.label}</Badge>
          )}
        </div>

        {desafio.description && (
          <p className="line-clamp-2 text-sm text-synse-muted">{desafio.description}</p>
        )}

        <p className="text-2xl font-semibold tabular-nums text-synse-text">
          {formatNumber(desafio.targetValue)}
          <span className="ml-1 text-sm font-normal text-synse-muted">{desafio.unit}</span>
        </p>

        <div className="flex flex-wrap items-center gap-3 text-xs text-synse-muted">
          <span className="flex items-center gap-1">
            <Users className="size-3.5" aria-hidden />
            {formatNumber(desafio.participants)} participando
          </span>
          <span className="flex items-center gap-1">
            {desafio.rankingEnabled ? (
              <>
                <Eye className="size-3.5" aria-hidden />
                Com ranking
              </>
            ) : (
              <>
                <EyeOff className="size-3.5" aria-hidden />
                Sem ranking
              </>
            )}
          </span>
        </div>

        {desafio.reward && (
          <p className="text-xs text-synse-primary">Prêmio: {desafio.reward}</p>
        )}

        {editavel && (
          <Button variant="outline" size="sm" asChild className="w-full">
            <Link href={`/challenges/${desafio.id}`}>Editar</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
