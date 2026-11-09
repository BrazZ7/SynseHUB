'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Check, Gift, Trophy, Users } from 'lucide-react'

import { Feedback } from '@/components/synse/form-field'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { joinGymChallengeAction } from '@/features/gym-challenges/actions'
import { initialGymChallengeState } from '@/features/gym-challenges/state'
import { cn, formatDate, formatNumber } from '@/lib/utils'
import type { GymChallengeForStudent } from '@/types/domain'

/**
 * Os desafios da academia, no app do aluno.
 *
 * Separados dos desafios do Synse porque são coisas diferentes: o do Synse é
 * escolha pessoal dentro de um catálogo, o da academia é uma competição local
 * com prêmio. Misturar os dois na mesma lista faria o aluno achar que gastou a
 * cota mensal ao entrar no da academia.
 */
export function GymChallengeList({ desafios }: { desafios: GymChallengeForStudent[] }) {
  if (desafios.length === 0) return null

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-synse-text">
        <Trophy className="size-4 text-synse-primary" aria-hidden />
        Desafios da sua academia
      </h2>

      {desafios.map((desafio) => (
        <CartaoDesafio key={desafio.id} desafio={desafio} />
      ))}
    </section>
  )
}

function CartaoDesafio({ desafio }: { desafio: GymChallengeForStudent }) {
  const [state, formAction] = useActionState(joinGymChallengeAction, initialGymChallengeState)

  const proporcao =
    desafio.targetValue > 0 ? Math.min(desafio.progressValue / desafio.targetValue, 1) : 0
  const concluido = Boolean(desafio.completedAt)

  return (
    <article
      className={cn(
        'rounded-2xl border p-4 shadow-synse-sm',
        concluido
          ? 'border-synse-success/40 bg-synse-success/5'
          : 'border-synse-border bg-synse-surface',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-synse-text">{desafio.title}</h3>
          <p className="text-xs text-synse-muted">Até {formatDate(desafio.endsAt)}</p>
        </div>
        {concluido ? (
          <Badge variant="success">
            <Check className="size-3" aria-hidden />
            Concluído
          </Badge>
        ) : (
          desafio.joined && <Badge variant="primary">Participando</Badge>
        )}
      </div>

      {desafio.description && (
        <p className="mt-2 text-sm text-synse-muted">{desafio.description}</p>
      )}

      {desafio.reward && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-synse-primary">
          <Gift className="size-3.5" aria-hidden />
          {desafio.reward}
        </p>
      )}

      {desafio.joined ? (
        <div className="mt-3 space-y-1.5">
          <div
            className="h-2 overflow-hidden rounded-full bg-synse-border"
            role="progressbar"
            aria-valuenow={Math.round(proporcao * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Progresso em ${desafio.title}`}
          >
            <div
              className={cn(
                'h-full rounded-full transition-[width] duration-500',
                concluido ? 'bg-synse-success' : 'bg-synse-primary',
              )}
              style={{ width: `${proporcao * 100}%` }}
            />
          </div>
          <p className="text-xs tabular-nums text-synse-muted">
            {formatNumber(Math.round(desafio.progressValue))} de{' '}
            {formatNumber(desafio.targetValue)} {desafio.unit}
          </p>
          {desafio.rankingEnabled && !desafio.rankingOptIn && (
            <p className="text-xs text-synse-muted">
              Você não aparece no ranking. Entre de novo marcando a opção para aparecer.
            </p>
          )}
        </div>
      ) : (
        <form action={formAction} className="mt-3 space-y-3">
          <input type="hidden" name="challengeId" value={desafio.id} />
          {state.status !== 'idle' && (
            <Feedback
              tone={state.status === 'success' ? 'success' : 'error'}
              message={state.message ?? ''}
            />
          )}

          {desafio.rankingEnabled && (
            <div className="flex items-start gap-2.5 rounded-xl bg-synse-surface-2 p-3">
              <Switch id={`ranking-${desafio.id}`} name="rankingOptIn" />
              <div>
                <label
                  htmlFor={`ranking-${desafio.id}`}
                  className="text-sm font-medium text-synse-text"
                >
                  Aparecer no ranking
                </label>
                {/*
                  A escolha é da pessoa, e o texto diz o que está em jogo: o
                  progresso mostra frequência e carga, que é informação sobre o
                  corpo e a rotina dela.
                */}
                <p className="text-xs text-synse-muted">
                  Seu nome e seu progresso ficam visíveis para os outros alunos. Sem marcar, você
                  participa do mesmo jeito.
                </p>
              </div>
            </div>
          )}

          <BotaoEntrar />
        </form>
      )}

      <p className="mt-2 flex items-center gap-1 text-xs text-synse-muted">
        <Users className="size-3" aria-hidden />
        {formatNumber(desafio.participants)} participando
      </p>
    </article>
  )
}

function BotaoEntrar() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" disabled={pending} className="w-full">
      {pending ? 'Entrando…' : 'Entrar no desafio'}
    </Button>
  )
}
