import type { Metadata } from 'next'
import Link from 'next/link'
import { Activity, CalendarCheck, Lock, Target, TrendingUp, Trophy } from 'lucide-react'

import { BackLink } from '@/components/synse/back-link'
import { EmptyState } from '@/components/synse/empty-state'
import { Badge } from '@/components/ui/badge'
import { Delta } from '@/features/analysis/components/delta'
import { SESSOES_RECENTES } from '@/features/analysis/metrics'
import { getAnaliseMensal } from '@/features/analysis/service'
import { requireStudentSession } from '@/lib/auth/require-session'
import { formatDate, formatNumber } from '@/lib/utils'

export const metadata: Metadata = { title: 'Sua análise' }

/**
 * A análise dos últimos 30 dias.
 *
 * Tela separada, e não mais uma seção no Progresso: aquela página já tem seis
 * blocos, e esta precisa de um lugar com nome próprio — é para cá que a página
 * do Synse+ aponta quando promete "análise comparada".
 *
 * ── O que é grátis e o que é do Synse+ ───────────────────────────────────────
 *
 * Segue a régua de `lib/plans/tiers.ts`: o Pro não desbloqueia o básico, ele
 * aprofunda. Então o que a pessoa fez — treinos, constância, recordes do
 * período — é de todo mundo. O que **compara** — período contra período,
 * aderência recente contra a anterior, curva de força do trimestre — é do
 * Synse+. Quem não assina vê que existe, e vê o próprio número básico junto,
 * em vez de uma tela de cadeado.
 */
export default async function AnalisePage() {
  const session = await requireStudentSession()
  const analise = await getAnaliseMensal(session.studentId)
  const assinante = session.tier === 'PRO'

  const semTreino = analise.totais.workouts === 0

  return (
    <div className="animate-fade-in-up space-y-5">
      <BackLink href="/app/progress" label="Progresso" />

      <header>
        <h1 className="text-2xl font-semibold text-synse-text">Sua análise</h1>
        <p className="text-sm text-synse-muted">
          Os últimos {analise.janela.dias} dias, comparados com os{' '}
          {analise.janela.dias} anteriores. Fechado em {formatDate(analise.janela.ate)}.
        </p>
      </header>

      {/*
        Schema pendente cai aqui junto com "ainda não treinou". São causas
        diferentes e a mensagem é a mesma de propósito: não há nada de útil a
        dizer para quem abriu a tela, e explicar migration para o aluno seria
        despejar problema nosso no colo dele.
      */}
      {semTreino ? (
        <EmptyState
          icon={Activity}
          title="Ainda não há o que analisar"
          description="Registre alguns treinos pelo Treino Ativo e a análise aparece aqui."
        />
      ) : (
        <>
          <section className="rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm">
            <h2 className="text-sm font-semibold text-synse-text">No período</h2>
            <dl className="mt-3 grid grid-cols-2 gap-4">
              <Numero
                rotulo="Treinos"
                valor={formatNumber(analise.totais.workouts)}
                delta={
                  assinante && analise.comparacao ? (
                    <Delta variacao={analise.comparacao.treinos} bomQuandoSobe />
                  ) : null
                }
              />
              <Numero
                rotulo="Volume"
                valor={`${formatNumber(Math.round(analise.totais.volumeKg / 1000))} t`}
                delta={
                  assinante && analise.comparacao ? (
                    <Delta
                      variacao={{
                        ...analise.comparacao.volumeKg,
                        delta: Math.round(analise.comparacao.volumeKg.delta / 1000),
                      }}
                      unidade=" t"
                    />
                  ) : null
                }
              />
              <Numero
                rotulo="Séries"
                valor={formatNumber(analise.totais.sets)}
                delta={
                  assinante && analise.comparacao ? (
                    <Delta variacao={analise.comparacao.series} />
                  ) : null
                }
              />
              <Numero
                rotulo="Exercícios"
                valor={formatNumber(analise.totais.distinctExercises)}
                delta={
                  assinante && analise.comparacao ? (
                    <Delta variacao={analise.comparacao.exerciciosDistintos} />
                  ) : null
                }
              />
            </dl>

            {assinante && !analise.comparacao && (
              <p className="mt-4 text-xs text-synse-muted">
                Ainda não há período anterior com treino para comparar. No mês que vem
                esta tela ganha as setas.
              </p>
            )}
          </section>

          {analise.constancia && (
            <section className="rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-synse-text">
                <CalendarCheck className="size-4 text-synse-primary" aria-hidden />
                Constância
              </h2>
              <dl className="mt-3 grid grid-cols-2 gap-4">
                <Numero
                  rotulo="Por semana"
                  valor={formatNumber(analise.constancia.mediaSemanal, {
                    maximumFractionDigits: 1,
                  })}
                />
                <Numero
                  rotulo="Maior intervalo"
                  valor={`${analise.constancia.maiorIntervaloDias} dias`}
                />
              </dl>
              {/*
                O número que a média esconde. Só aparece quando há o que
                mostrar — lembrar de treinar quem treinou ontem é ruído.
              */}
              {analise.constancia.diasSemTreinar != null &&
                analise.constancia.diasSemTreinar >= 7 && (
                  <p className="mt-4 text-xs text-synse-muted">
                    Seu último treino foi há {analise.constancia.diasSemTreinar} dias.
                  </p>
                )}
            </section>
          )}

          {assinante ? (
            <>
              {analise.aderencia && (
                <section className="rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-synse-text">
                    <Target className="size-4 text-synse-primary" aria-hidden />
                    Aderência ao plano
                    <Badge variant="primary">Synse+</Badge>
                  </h2>
                  <p className="mt-3 text-3xl font-semibold tabular-nums text-synse-text">
                    {Math.round(analise.aderencia.fracao * 100)}%
                  </p>
                  <p className="text-xs text-synse-muted">
                    {formatNumber(analise.aderencia.feitas)} de{' '}
                    {formatNumber(analise.aderencia.planejadas)} repetições previstas, em{' '}
                    {analise.aderencia.sessoes} treinos.
                  </p>

                  {analise.aderencia.recente != null && analise.aderencia.anterior != null && (
                    <p className="mt-4 text-sm text-synse-text">
                      Nos últimos {SESSOES_RECENTES} treinos você fechou{' '}
                      <strong className="tabular-nums">
                        {Math.round(analise.aderencia.recente * 100)}%
                      </strong>
                      , contra{' '}
                      <strong className="tabular-nums">
                        {Math.round(analise.aderencia.anterior * 100)}%
                      </strong>{' '}
                      antes deles.
                    </p>
                  )}

                  {analise.aderencia.seriesAbaixo > 0 && (
                    <p className="mt-2 text-xs text-synse-muted">
                      {analise.aderencia.seriesAbaixo} séries pararam antes do previsto.
                      Costuma ser carga alta demais ou descanso curto — não falta de
                      disposição.
                    </p>
                  )}
                </section>
              )}

              {analise.forca.length > 0 && (
                <section className="rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-synse-text">
                    <TrendingUp className="size-4 text-synse-primary" aria-hidden />
                    Curva de força
                    <Badge variant="primary">Synse+</Badge>
                  </h2>
                  <p className="mt-1 text-xs text-synse-muted">
                    Carga máxima no trimestre. Força não se move em trinta dias.
                  </p>
                  <ul className="mt-3 divide-y divide-synse-border">
                    {analise.forca.map((linha) => (
                      <li
                        key={linha.exerciseId}
                        className="flex items-center gap-3 py-2.5"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm text-synse-text">
                          {linha.exerciseName}
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-synse-muted">
                          {formatNumber(linha.evolucao.de, { maximumFractionDigits: 1 })} →{' '}
                          {formatNumber(linha.evolucao.para, { maximumFractionDigits: 1 })} kg
                        </span>
                        <Delta variacao={linha.evolucao} unidade=" kg" bomQuandoSobe casas={1} />
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          ) : (
            <Link
              href="/app/synse"
              className="flex items-start gap-2.5 rounded-2xl border border-synse-border bg-synse-surface p-5 text-sm text-synse-text shadow-synse-sm transition-colors hover:border-synse-primary"
            >
              <Lock className="mt-0.5 size-4 shrink-0 text-synse-primary" aria-hidden />
              <span>
                <strong className="font-medium">O Synse+ compara.</strong> Período contra
                período, aderência dos últimos treinos contra os anteriores, e a curva de
                força do trimestre — em cima destes mesmos números.
              </span>
            </Link>
          )}

          {analise.recordes.length > 0 && (
            <section className="rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-synse-text">
                <Trophy className="size-4 text-synse-primary" aria-hidden />
                Recordes do período
              </h2>
              <ul className="mt-3 divide-y divide-synse-border">
                {analise.recordes.map((recorde) => (
                  <li key={recorde.exerciseId} className="flex items-center gap-3 py-2.5">
                    <span className="min-w-0 flex-1 truncate text-sm text-synse-text">
                      {recorde.exerciseName}
                    </span>
                    <span className="shrink-0 text-xs text-synse-muted">
                      {formatDate(recorde.achievedAt)}
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-synse-primary">
                      {formatNumber(recorde.maxWeight, { maximumFractionDigits: 1 })} kg
                      <span className="ml-1 text-xs font-normal text-synse-muted">
                        × {recorde.reps}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}

function Numero({
  rotulo,
  valor,
  delta,
}: {
  rotulo: string
  valor: string
  delta?: React.ReactNode
}) {
  return (
    <div>
      <dt className="text-xs text-synse-muted">{rotulo}</dt>
      <dd className="text-lg font-semibold tabular-nums text-synse-text">{valor}</dd>
      {delta && <dd className="mt-0.5">{delta}</dd>}
    </div>
  )
}
