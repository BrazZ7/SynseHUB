'use client'

import { useState, useTransition } from 'react'
import { Check, Footprints, Dumbbell, MapPin, X } from 'lucide-react'

import { definirPresencaAction } from '@/features/squad/actions'
import { PRESENCAS } from '@/features/squad/state'
import { cn } from '@/lib/utils'
import type { PresenceState } from '@/types/domain'

const ICONE: Record<PresenceState, typeof MapPin> = {
  A_CAMINHO: Footprints,
  CHEGUEI: MapPin,
  TREINANDO: Dumbbell,
  TERMINEI: Check,
}

/**
 * ── O gesto principal do lobby ──────────────────────────────────────────────
 *
 * É o que a pessoa abre o app para fazer: dizer que chegou. Por isso ele é a
 * coisa maior da tela, acima da lista, e não um menu escondido atrás do
 * próprio avatar.
 *
 * Os quatro estados em linha e não um `select`: são quatro, cabem, e um toque
 * vale mais que dois. Tocar no estado que já está aceso **apaga** — é o "já
 * fui" sem precisar de um quinto botão que ninguém procuraria.
 *
 * Otimista, e volta atrás se o servidor recusar: mostrar "chegou" para o grupo
 * sem ter gravado é o pior dos três resultados possíveis.
 */
export function PainelDePresenca({ inicial }: { inicial: PresenceState | null }) {
  const [estado, setEstado] = useState<PresenceState | null>(inicial)
  const [gravando, iniciar] = useTransition()

  const tocar = (valor: PresenceState) => {
    const anterior = estado
    const proximo = anterior === valor ? null : valor
    setEstado(proximo)

    iniciar(async () => {
      const resposta = await definirPresencaAction(proximo)
      if (!resposta.ok) setEstado(anterior)
    })
  }

  return (
    <section className="rounded-2xl border border-synse-border bg-synse-surface p-4 shadow-synse-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-synse-muted">
          Onde você está
        </p>
        {estado && (
          <button
            type="button"
            onClick={() => tocar(estado)}
            disabled={gravando}
            className="inline-flex items-center gap-1 text-xs text-synse-muted hover:text-synse-text"
          >
            <X className="size-3.5" aria-hidden />
            Limpar
          </button>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PRESENCAS.map(({ valor, rotulo, curto }) => {
          const Icone = ICONE[valor]
          const aceso = estado === valor
          return (
            <button
              key={valor}
              type="button"
              onClick={() => tocar(valor)}
              disabled={gravando}
              aria-pressed={aceso}
              aria-label={rotulo}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-xs font-medium transition-colors disabled:opacity-60',
                aceso
                  ? 'border-synse-primary bg-synse-primary text-white'
                  : 'border-synse-border text-synse-muted hover:border-synse-primary/50 hover:text-synse-text',
              )}
            >
              <Icone className="size-5" aria-hidden />
              {curto}
            </button>
          )
        })}
      </div>

      {/*
        Quanto tempo o aviso vale. Sem isto, quem marca "cheguei" e esquece
        acha que o grupo continua vendo — e o grupo, que não vê mais, acha que
        a pessoa nunca marcou.
      */}
      <p className="mt-3 text-[11px] text-synse-muted">
        O aviso vale por 4 horas e some sozinho depois disso.
      </p>
    </section>
  )
}
