import type { Metadata } from 'next'
import Link from 'next/link'
import { Sparkles, Trophy } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ChallengePicker } from '@/features/challenges/challenge-picker'
import { MedalBadge } from '@/features/challenges/medal-badge'
import { ProgressForm } from '@/features/challenges/progress-form'
import { cycleLabel, getChallengeBoard } from '@/features/challenges/service'
import { requireStudentSession } from '@/lib/auth/require-session'
import { CHALLENGES_PER_CYCLE } from '@/lib/plans/tiers'

export const metadata: Metadata = { title: 'Desafios' }

export default async function ChallengesPage() {
  const session = await requireStudentSession()
  const board = await getChallengeBoard(session)

  const cicloAtual = cycleLabel(new Date().toISOString())

  /*
   * Migration 0014 pendente: a tela avisa em vez de estourar. Publicar não
   * aplica migration, e entre um e outro esta página não tem banco para ler.
   */
  if (!board.available) {
    return (
      <div className="animate-fade-in-up space-y-5">
        <header>
          <h1 className="text-2xl font-semibold text-synse-text">Desafios</h1>
        </header>
        <p className="rounded-xl bg-synse-surface-2 p-4 text-sm text-synse-muted">
          Os desafios estão sendo liberados nesta conta. Volte em instantes — seu treino base e seu
          plano alimentar já estão disponíveis.
        </p>
      </div>
    )
  }

  return (
    <div className="animate-fade-in-up space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-synse-text">Desafios</h1>
        <p className="text-sm text-synse-muted">
          Um objetivo por mês. No fim de {cicloAtual} você recebe a análise e a medalha.
        </p>
      </header>

      {/* Análise do mês fechado: é o que a pessoa volta para ver */}
      {board.lastReport && (
        <section className="rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-synse-primary">
              {cycleLabel(board.lastReport.cycle)}
            </p>
            <MedalBadge level={board.lastReport.medal.level} />
          </div>

          <h2 className="mt-2 text-base font-semibold text-synse-text">
            {board.lastReport.challenge?.title ?? 'Desafio do mês'}
          </h2>
          <p className="mt-1 text-sm text-synse-muted">
            Você somou {board.lastReport.medal.progressValue.toLocaleString('pt-BR')} de{' '}
            {board.lastReport.medal.targetValue.toLocaleString('pt-BR')}{' '}
            {board.lastReport.challenge?.unit ?? ''} — {board.lastReport.percentage}% da meta.
          </p>
          <Progress value={board.lastReport.percentage} className="mt-3" />
        </section>
      )}

      {/* Desafios em andamento */}
      {board.active.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-synse-text">Em andamento</h2>

          {board.active.map((entry) => (
            <article
              key={entry.id}
              className="rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-synse-text">{entry.challenge.title}</h3>
                  <p className="mt-0.5 text-xs text-synse-muted">
                    {entry.progressValue.toLocaleString('pt-BR')} de{' '}
                    {entry.targetValue.toLocaleString('pt-BR')} {entry.challenge.unit}
                  </p>
                </div>
                <span className="text-lg font-semibold tabular-nums text-synse-text">
                  {entry.percentage}%
                </span>
              </div>

              <Progress value={entry.percentage} className="mt-3" />

              {entry.challenge.metric === 'CHECKINS' ? (
                <p className="mt-3 text-xs text-synse-muted">
                  Conta sozinho: cada check-in seu soma um treino aqui.
                </p>
              ) : (
                <ProgressForm code={entry.challengeCode} unit={entry.challenge.unit} />
              )}
            </article>
          ))}
        </section>
      )}

      {/* Catálogo */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-synse-text">
            {board.active.length > 0 ? 'Outros desafios' : 'Escolha o seu desafio'}
          </h2>
          <Badge variant="outline">
            {board.slotsLeft} de {board.slotsTotal} {board.slotsTotal === 1 ? 'vaga' : 'vagas'}
          </Badge>
        </div>

        <ChallengePicker
          catalog={board.catalog}
          tier={session.tier}
          chosen={board.active.map((entry) => entry.challengeCode)}
          slotsLeft={board.slotsLeft}
        />
      </section>

      {/* Medalhas */}
      {board.medals.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-synse-text">Suas medalhas</h2>
          <ul className="space-y-2">
            {board.medals.map((medal) => (
              <li
                key={medal.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-synse-border bg-synse-surface px-4 py-3"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm text-synse-text">
                    {board.catalog.find((item) => item.code === medal.challengeCode)?.title ??
                      medal.challengeCode}
                  </span>
                  <span className="block text-xs text-synse-muted">{cycleLabel(medal.cycle)}</span>
                </span>
                <MedalBadge level={medal.level} size="sm" />
              </li>
            ))}
          </ul>
        </section>
      )}

      {board.medals.length === 0 && (
        <p className="flex items-start gap-2.5 rounded-xl bg-synse-surface-2 p-4 text-sm text-synse-muted">
          <Trophy className="mt-0.5 size-4 shrink-0" aria-hidden />
          Sua primeira medalha chega no fim do mês, com a análise do que você conseguiu.
        </p>
      )}

      {session.tier !== 'PRO' && (
        <Link
          href="/app/synse"
          className="flex items-start gap-2.5 rounded-xl border border-synse-border bg-synse-surface p-4 text-sm text-synse-text transition-colors hover:border-synse-primary"
        >
          <Sparkles className="mt-0.5 size-4 shrink-0 text-synse-primary" aria-hidden />
          <span>
            No plano gratuito é {CHALLENGES_PER_CYCLE.FREE} desafio por mês. O Synse+ abre{' '}
            {CHALLENGES_PER_CYCLE.PRO} e os desafios exclusivos.
          </span>
        </Link>
      )}
    </div>
  )
}
