import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CalendarDays, Sparkles } from 'lucide-react'

import { BackLink } from '@/components/synse/back-link'
import { PageHeader } from '@/components/synse/page-header'
import { Badge } from '@/components/ui/badge'
import { AbandonarPrograma, IniciarPrograma } from '@/features/programs/acoes-do-programa'
import { DiaToggle } from '@/features/programs/dia-toggle'
import { requireStudentSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { cn } from '@/lib/utils'
import { ColunaDeLeitura } from '@/components/synse/duas-colunas'

export const metadata: Metadata = { title: 'Programa' }

/**
 * ── O programa, dia a dia ────────────────────────────────────────────────────
 *
 * A tela não decide nada sobre acesso. `getProgram` lê pelas políticas da
 * 0038/0043, e programa que a conta não enxerga volta nulo — que aqui é 404,
 * e não "sem permissão": distinguir contaria ao plano gratuito que aquele id
 * existe.
 *
 * Marcar o dia também não é decisão daqui: `concluir_dia` confere a
 * visibilidade de novo no banco, porque a assinatura pode vencer no meio do
 * programa e a tela aberta não saberia.
 */
export default async function ProgramaPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStudentSession()
  const { id } = await params

  const dataSource = await getDataSource()
  const dados = await dataSource.getProgram(id)
  if (!dados) notFound()

  const { programa, passos, matricula } = dados
  const feitos = new Set(matricula?.completedDays ?? [])
  const progresso = Math.round((feitos.size / programa.durationDays) * 100)
  const emAndamento = matricula?.status === 'ACTIVE'
  const concluido = matricula?.status === 'COMPLETED'

  return (
    <ColunaDeLeitura className="animate-fade-in-up space-y-5">
      <BackLink href="/app/programs" label="Programas" />

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">
            <CalendarDays className="size-3" aria-hidden />
            {programa.durationDays} dias
          </Badge>
          {programa.visibility === 'SYNSE_PLUS' && (
            <Badge variant="primary">
              <Sparkles className="size-3" aria-hidden />
              Synse+
            </Badge>
          )}
        </div>

        <PageHeader title={programa.title} description={programa.description ?? undefined} />
      </div>

      {emAndamento && (
        <section className="vidro-led rounded-2xl border border-synse-border bg-synse-surface p-4">
          <div className="flex items-end justify-between gap-3">
            <p className="text-sm font-semibold text-synse-text">
              Dia {matricula.currentDay} de {programa.durationDays}
            </p>
            <p className="text-sm tabular-nums text-synse-muted">{progresso}%</p>
          </div>

          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-synse-bg"
            role="progressbar"
            aria-valuenow={progresso}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progresso do programa"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-synse-primary to-synse-primary-light"
              style={{ width: `${progresso}%` }}
            />
          </div>

          <p className="mt-2 text-xs text-synse-muted">
            {feitos.size} de {programa.durationDays} dias concluídos.
          </p>
        </section>
      )}

      {concluido && (
        <section className="vidro-led rounded-2xl border border-synse-border bg-synse-surface p-5 text-center">
          <p className="text-sm font-semibold text-synse-success">Programa concluído.</p>
          <p className="mt-1 text-sm text-synse-muted">
            Os {programa.durationDays} dias estão marcados. Dá para recomeçar quando quiser.
          </p>
        </section>
      )}

      {!emAndamento && (
        <IniciarPrograma
          programId={programa.id}
          rotulo={matricula ? 'Recomeçar do dia 1' : 'Começar este programa'}
        />
      )}

      {passos.length === 0 ? (
        /*
         * Programa publicado sem dias. Não é erro de leitura — é um programa
         * pela metade —, e dizer isso é melhor do que uma lista vazia que
         * parece falha de carregamento.
         */
        <p className="text-sm text-synse-muted">Este programa ainda não tem os dias publicados.</p>
      ) : (
        <ol className="space-y-2">
          {passos.map((passo) => {
            const feito = feitos.has(passo.dayNumber)
            const atual = emAndamento && matricula.currentDay === passo.dayNumber

            return (
              <li
                key={passo.id}
                className={cn(
                  'flex items-start gap-3 rounded-2xl border p-4 transition-colors',
                  atual
                    ? 'border-synse-primary/40 bg-synse-surface'
                    : 'border-synse-border bg-synse-surface',
                  feito && 'opacity-70',
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-synse-muted">
                      Dia {passo.dayNumber}
                    </span>
                    {atual && <Badge variant="primary">Hoje</Badge>}
                  </div>

                  <p
                    className={cn(
                      'mt-1 text-sm font-medium text-synse-text',
                      feito && 'line-through',
                    )}
                  >
                    {passo.title}
                  </p>

                  {passo.tasks.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5">
                      {passo.tasks.map((tarefa, i) => (
                        <li key={i} className="text-xs leading-relaxed text-synse-muted">
                          {tarefa}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Marcar só faz sentido depois de entrar no programa. */}
                {emAndamento && (
                  <DiaToggle programId={programa.id} dia={passo.dayNumber} feito={feito} />
                )}
              </li>
            )
          })}
        </ol>
      )}

      {emAndamento && <AbandonarPrograma programId={programa.id} />}
    </ColunaDeLeitura>
  )
}
