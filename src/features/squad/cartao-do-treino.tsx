'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { CalendarClock, Dumbbell, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { cancelarTreinoDoEsquadraoAction, responderTreinoAction } from '@/features/squad/actions'
import { quando } from '@/features/squad/state'
import { cn } from '@/lib/utils'
import type { SquadRsvp, SquadSession } from '@/types/domain'

const RESPOSTAS: ReadonlyArray<{ valor: SquadRsvp; rotulo: string }> = [
  { valor: 'VOU', rotulo: 'Vou' },
  { valor: 'TALVEZ', rotulo: 'Talvez' },
  { valor: 'NAO_VOU', rotulo: 'Não vou' },
]

/**
 * Um treino marcado, com as três respostas.
 *
 * ── Os números mudam na hora, inclusive os dos outros ───────────────────────
 *
 * Trocar de "talvez" para "vou" move **duas** contagens, e esperar o servidor
 * para mexer as duas deixaria o cartão mentindo por meio segundo em cima do
 * gesto mais repetido da tela. A conta otimista é feita aqui e desfeita
 * inteira se a gravação falhar.
 */
export function CartaoDoTreino({
  sessao,
  podeCancelar,
}: {
  sessao: SquadSession
  podeCancelar: boolean
}) {
  const [resposta, setResposta] = useState<SquadRsvp | null>(sessao.minhaResposta)
  const [contagem, setContagem] = useState({
    VOU: sessao.vou,
    TALVEZ: sessao.talvez,
    NAO_VOU: sessao.naoVou,
  })
  const [cancelado, setCancelado] = useState(sessao.cancelado)
  const [gravando, iniciar] = useTransition()

  const responder = (valor: SquadRsvp) => {
    if (valor === resposta) return
    const anteriores = { resposta, contagem }

    setResposta(valor)
    setContagem((atual) => ({
      ...atual,
      ...(anteriores.resposta ? { [anteriores.resposta]: atual[anteriores.resposta] - 1 } : {}),
      [valor]: atual[valor] + 1,
    }))

    iniciar(async () => {
      const r = await responderTreinoAction(sessao.id, valor)
      if (!r.ok) {
        setResposta(anteriores.resposta)
        setContagem(anteriores.contagem)
      }
    })
  }

  const cancelar = () => {
    setCancelado(true)
    iniciar(async () => {
      const r = await cancelarTreinoDoEsquadraoAction(sessao.id)
      if (!r.ok) setCancelado(false)
    })
  }

  return (
    <article
      className={cn(
        'rounded-2xl border p-4 shadow-synse-sm transition-opacity',
        cancelado
          ? 'border-dashed border-synse-border bg-synse-surface/60 opacity-70'
          : 'border-synse-border bg-synse-surface',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-synse-text">
            <CalendarClock className="size-4 shrink-0 text-synse-primary" aria-hidden />
            {quando(sessao.startsAt)}
          </p>
          {sessao.title && <p className="mt-0.5 text-sm text-synse-muted">{sessao.title}</p>}
          {sessao.criadoPorNome && (
            <p className="mt-0.5 text-xs text-synse-muted">Marcado por {sessao.criadoPorNome}</p>
          )}
        </div>

        {cancelado ? (
          <Badge variant="outline">Cancelado</Badge>
        ) : (
          podeCancelar && (
            <button
              type="button"
              onClick={cancelar}
              disabled={gravando}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-synse-muted hover:text-synse-text disabled:opacity-60"
            >
              <X className="size-3.5" aria-hidden />
              Cancelar
            </button>
          )
        )}
      </div>

      {/*
        A ficha que veio junto — o "enviar treino". Elo e não botão: abre a
        tela da ficha, que é onde ela tem os exercícios.
      */}
      {sessao.workoutPlanId && (
        <Link
          href="/app/workout"
          className="mt-3 flex items-center gap-2 rounded-xl border border-synse-border bg-synse-surface-2 px-3 py-2 text-sm text-synse-text transition-colors hover:border-synse-primary/40"
        >
          <Dumbbell className="size-4 shrink-0 text-synse-primary" aria-hidden />
          <span className="min-w-0 truncate">{sessao.planoNome ?? 'Ficha de treino'}</span>
        </Link>
      )}

      {!cancelado && (
        <>
          <div className="mt-3 flex gap-2">
            {RESPOSTAS.map(({ valor, rotulo }) => (
              <button
                key={valor}
                type="button"
                onClick={() => responder(valor)}
                disabled={gravando}
                aria-pressed={resposta === valor}
                className={cn(
                  'flex-1 rounded-xl border px-2 py-2 text-xs font-medium transition-colors disabled:opacity-60',
                  resposta === valor
                    ? 'border-synse-primary bg-synse-primary text-white'
                    : 'border-synse-border text-synse-muted hover:border-synse-primary/50',
                )}
              >
                {rotulo}
              </button>
            ))}
          </div>

          <p className="mt-2 text-xs text-synse-muted">
            {contagem.VOU} {contagem.VOU === 1 ? 'confirmado' : 'confirmados'}
            {contagem.TALVEZ > 0 && ` · ${contagem.TALVEZ} talvez`}
          </p>
        </>
      )}
    </article>
  )
}
