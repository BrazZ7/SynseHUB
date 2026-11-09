'use client'

import { useState, useTransition } from 'react'
import { Check, Dumbbell, Flag, Footprints } from 'lucide-react'

import { definirPresencaAction } from '@/features/squad/actions'
import { listaDeNomes } from '@/features/squad/state'
import { cn } from '@/lib/utils'
import type { PresenceState } from '@/types/domain'

/**
 * ── "Estou pronto" ──────────────────────────────────────────────────────────
 *
 * O botão grande da referência. Ele não é um estado novo: é a presença
 * `CHEGUEI`, que o esquadrão já tinha — o que muda é o peso na tela.
 *
 * Inventar um "pronto" separado de "cheguei" criaria dois jeitos de dizer a
 * mesma coisa e a pergunta inevitável de qual dos dois o grupo vê. Um
 * conceito, um botão grande, e os outros três estados como ajuste ao lado.
 *
 * ── Tocar de novo desmarca ──────────────────────────────────────────────────
 *
 * Quem marcou por engano precisa de saída, e um segundo botão "não estou mais"
 * seria ruído permanente para um caso raro. O rótulo muda para "Pronto" com o
 * estado aceso, e o toque volta ao normal.
 */

const AJUSTES: ReadonlyArray<{ valor: PresenceState; rotulo: string; icone: typeof Footprints }> =
  [
    { valor: 'A_CAMINHO', rotulo: 'A caminho', icone: Footprints },
    { valor: 'TREINANDO', rotulo: 'Treinando', icone: Dumbbell },
    { valor: 'TERMINEI', rotulo: 'Terminei', icone: Flag },
  ]

export function BarraDeProntidao({
  inicial,
  prontos,
  total,
  faltam,
  restantes,
}: {
  inicial: PresenceState | null
  prontos: number
  total: number
  faltam: string[]
  restantes: number
}) {
  const [estado, setEstado] = useState<PresenceState | null>(inicial)
  const [gravando, iniciar] = useTransition()

  const marcar = (valor: PresenceState | null) => {
    const anterior = estado
    setEstado(valor)
    iniciar(async () => {
      const resposta = await definirPresencaAction(valor)
      if (!resposta.ok) setEstado(anterior)
    })
  }

  /*
   * A contagem otimista: o número de cima acompanha o toque de baixo. Sem
   * isto, "2 de 4 prontos" continuaria dizendo 2 depois de a pessoa se marcar
   * — e os dois números na mesma barra discordariam até o servidor responder.
   */
  const euEstavaPronto = inicial === 'CHEGUEI' || inicial === 'TREINANDO'
  const euEstouPronto = estado === 'CHEGUEI' || estado === 'TREINANDO'
  const contagem = prontos - (euEstavaPronto ? 1 : 0) + (euEstouPronto ? 1 : 0)

  const pronto = estado === 'CHEGUEI'

  return (
    <section className="space-y-3 rounded-2xl border border-synse-border bg-synse-surface p-4 shadow-synse-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          {/*
            "prontos" sempre, mesmo com um: a concordância é com o grupo, e
            "1 de 4 pronto" tropeça na leitura.
          */}
          <p className="text-lg font-semibold tabular-nums text-synse-text">
            {contagem} de {total} prontos
          </p>
          <p className="truncate text-xs text-synse-muted">
            {faltam.length === 0 && restantes === 0
              ? 'Todo mundo avisou que chegou.'
              : `Aguardando ${listaDeNomes(faltam, restantes)}`}
          </p>
        </div>

        <button
          type="button"
          onClick={() => marcar(pronto ? null : 'CHEGUEI')}
          disabled={gravando}
          aria-pressed={pronto}
          className={cn(
            'inline-flex min-w-[170px] flex-1 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-colors disabled:opacity-60 sm:flex-none',
            pronto
              ? 'bg-synse-primary text-white shadow-glow'
              : 'border border-synse-primary bg-synse-primary/10 text-synse-primary hover:bg-synse-primary/20',
          )}
        >
          <Check className="size-4" aria-hidden />
          {pronto ? 'Pronto' : 'Estou pronto'}
        </button>
      </div>

      {/* Os outros três estados, menores: ajuste, não decisão principal. */}
      <div className="flex gap-2">
        {AJUSTES.map(({ valor, rotulo, icone: Icone }) => {
          const aceso = estado === valor
          return (
            <button
              key={valor}
              type="button"
              onClick={() => marcar(aceso ? null : valor)}
              disabled={gravando}
              aria-pressed={aceso}
              className={cn(
                'inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-xs font-medium transition-colors disabled:opacity-60',
                aceso
                  ? 'border-synse-primary bg-synse-primary/10 text-synse-primary'
                  : 'border-synse-border text-synse-muted hover:border-synse-primary/50',
              )}
            >
              <Icone className="size-3.5" aria-hidden />
              {rotulo}
            </button>
          )
        })}
      </div>

      <p className="text-[11px] text-synse-muted">
        O aviso vale por 4 horas e some sozinho depois disso.
      </p>
    </section>
  )
}
