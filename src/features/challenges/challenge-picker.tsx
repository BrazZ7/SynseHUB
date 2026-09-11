'use client'

import { Lock, TriangleAlert } from 'lucide-react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { chooseChallengeAction, initialChallengeState } from '@/features/challenges/actions'
import type { UserTier } from '@/lib/plans/tiers'
import type { BaselineChallenge } from '@/types/domain'

type Props = {
  catalog: BaselineChallenge[]
  tier: UserTier
  /** Códigos já escolhidos neste ciclo. */
  chosen: string[]
  slotsLeft: number
}

/**
 * Escolha do desafio do mês.
 *
 * Os desafios do Pro aparecem para quem está no gratuito, bloqueados. Escondê-
 * los deixaria a tela mais limpa e ninguém saberia o que está perdendo — que é
 * justamente o que faz alguém assinar.
 */
export function ChallengePicker({ catalog, tier, chosen, slotsLeft }: Props) {
  const [state, formAction] = useActionState(chooseChallengeAction, initialChallengeState)
  const escolhidos = new Set(chosen)

  return (
    <div className="space-y-3">
      {state.error && (
        <p
          role="alert"
          className="bg-synse-danger/10 flex items-start gap-2.5 rounded-lg p-3 text-sm text-synse-danger"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {state.error}
        </p>
      )}

      {catalog.map((challenge) => {
        const bloqueadoPorPlano = challenge.minTier === 'PRO' && tier !== 'PRO'
        const jaEscolhido = escolhidos.has(challenge.code)
        const semVaga = slotsLeft === 0 && !jaEscolhido

        return (
          <article
            key={challenge.code}
            className="rounded-2xl border border-synse-border bg-synse-surface p-4 shadow-synse-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-medium text-synse-text">{challenge.title}</h3>
                  {challenge.minTier === 'PRO' && <Badge variant="outline">Synse+</Badge>}
                  {jaEscolhido && <Badge variant="success">Em andamento</Badge>}
                </div>
                <p className="mt-1 text-sm text-synse-muted">{challenge.description}</p>
                <p className="mt-1.5 text-xs text-synse-muted">
                  Meta: {challenge.targetValue.toLocaleString('pt-BR')} {challenge.unit}
                </p>
              </div>
            </div>

            {!jaEscolhido && (
              <form action={formAction} className="mt-3">
                <input type="hidden" name="code" value={challenge.code} />
                <ChooseButton disabled={bloqueadoPorPlano || semVaga} locked={bloqueadoPorPlano} />
                {semVaga && !bloqueadoPorPlano && (
                  <p className="mt-1.5 text-xs text-synse-muted">
                    Você já tem o desafio deste mês. No Synse+ dá para levar mais de um.
                  </p>
                )}
              </form>
            )}
          </article>
        )
      })}
    </div>
  )
}

function ChooseButton({ disabled, locked }: { disabled: boolean; locked: boolean }) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" size="sm" variant="outline" disabled={disabled || pending}>
      {locked && <Lock className="size-3.5" aria-hidden />}
      {locked ? 'Disponível no Synse+' : pending ? 'Escolhendo…' : 'Escolher este'}
    </Button>
  )
}
