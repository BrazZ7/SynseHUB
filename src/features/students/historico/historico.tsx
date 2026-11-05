'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { ChevronRight, Dumbbell, Footprints, QrCode, Scale, TriangleAlert } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { proximaPaginaDoHistoricoAction } from '@/features/students/historico/actions'
import {
  agruparPorDia,
  elo,
  nomeDoTipo,
  proximoCursor,
  resumoDaEntrada,
} from '@/features/students/historico/linha-do-tempo'
import { cn } from '@/lib/utils'
import type { TimelineEntry, TimelineKind } from '@/types/domain'

/**
 * ── O histórico integrado ────────────────────────────────────────────────────
 *
 * Treino, corrida, presença e pesagem numa lista só, em ordem de tempo. Antes
 * disto a resposta para "o que eu fiz na semana passada?" exigia abrir quatro
 * telas e juntar de cabeça.
 *
 * ── Carregar mais, e não rolagem infinita ────────────────────────────────────
 *
 * Rolagem infinita num histórico é um jeito de nunca chegar ao fim: a pessoa
 * procura um treino de dois meses atrás e rola sem saber quanto falta. O botão
 * diz quanto já veio e some quando acabou — que é a informação que a rolagem
 * infinita esconde.
 */

const ICONE: Record<TimelineKind, typeof Dumbbell> = {
  TREINO: Dumbbell,
  CORRIDA: Footprints,
  CHECKIN: QrCode,
  PESAGEM: Scale,
}

export function Historico({
  inicial,
  porPagina,
  fuso,
}: {
  inicial: TimelineEntry[]
  porPagina: number
  /** O fuso da academia: é nele que o dia civil é decidido. */
  fuso: string
}) {
  const [entradas, setEntradas] = useState(inicial)
  const [cursor, setCursor] = useState(() => proximoCursor(inicial, porPagina))
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, iniciar] = useTransition()

  const dias = agruparPorDia(entradas, fuso)

  return (
    <div className="space-y-6">
      {dias.map((dia) => (
        <section key={dia.dia} className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-synse-muted">
            <RotuloDoDia dia={dia.dia} fuso={fuso} />
          </h2>
          <ul className="space-y-2">
            {dia.entradas.map((entrada) => (
              <li key={`${entrada.kind}:${entrada.refId}`}>
                <Entrada entrada={entrada} fuso={fuso} />
              </li>
            ))}
          </ul>
        </section>
      ))}

      {erro && (
        <p role="alert" className="text-sm text-synse-danger">
          {erro}
        </p>
      )}

      {cursor && (
        <Button
          variant="outline"
          className="w-full"
          disabled={carregando}
          onClick={() =>
            iniciar(async () => {
              setErro(null)
              const resultado = await proximaPaginaDoHistoricoAction(cursor, porPagina)
              if (!resultado.ok) {
                setErro(resultado.erro)
                return
              }
              setEntradas((atuais) => [...atuais, ...resultado.entradas])
              /*
               * O cursor novo sai da página que chegou, não da lista inteira:
               * é o último item **desta** resposta que diz onde a próxima
               * começa, e é ele que vira `null` quando o histórico acabou.
               */
              setCursor(proximoCursor(resultado.entradas, porPagina))
            })
          }
        >
          {carregando ? 'Carregando…' : 'Carregar mais'}
        </Button>
      )}
    </div>
  )
}

function RotuloDoDia({ dia, fuso }: { dia: string; fuso: string }) {
  /*
   * `dia` já é a data civil no fuso da academia (`2026-10-23`). Formatar com
   * `new Date('2026-10-23')` a leria como meia-noite UTC e, a oeste de
   * Greenwich, mostraria o dia anterior — o mesmo defeito que o agrupamento
   * existe para evitar. O `T12:00` no meio do dia é imune a isso.
   */
  const data = new Date(`${dia}T12:00:00`)
  return (
    <time dateTime={dia}>
      {new Intl.DateTimeFormat('pt-BR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        timeZone: fuso,
      }).format(data)}
    </time>
  )
}

function Entrada({ entrada, fuso }: { entrada: TimelineEntry; fuso: string }) {
  const Icone = ICONE[entrada.kind]
  const partes = resumoDaEntrada(entrada)
  const destino = elo(entrada)

  const hora = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: fuso,
  }).format(new Date(entrada.happenedAt))

  const conteudo = (
    <>
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-full',
          entrada.discomfort
            ? 'bg-synse-warning/20 text-synse-warning'
            : 'bg-synse-surface-2 text-synse-muted',
        )}
      >
        <Icone className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium text-synse-text">
            {entrada.title ?? nomeDoTipo(entrada.kind)}
          </span>
          {entrada.title && (
            <span className="text-xs text-synse-muted">{nomeDoTipo(entrada.kind)}</span>
          )}
          <span className="text-xs tabular-nums text-synse-muted">{hora}</span>
        </span>
        {partes.length > 0 && (
          <span className="mt-0.5 block text-sm text-synse-muted">{partes.join(' · ')}</span>
        )}
        {entrada.discomfort && (
          <span className="mt-1 flex items-center gap-1 text-xs font-medium text-synse-warning">
            <TriangleAlert className="size-3.5" aria-hidden />
            Você relatou dor ou desconforto
          </span>
        )}
      </span>
      {destino && <ChevronRight className="size-4 shrink-0 text-synse-muted" aria-hidden />}
    </>
  )

  const classes = cn(
    'flex items-start gap-3 rounded-xl border border-synse-border bg-synse-surface p-3',
    destino && 'hover:border-synse-primary/50',
  )

  return destino ? (
    <Link
      href={destino}
      className={cn(
        classes,
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-synse-primary',
      )}
    >
      {conteudo}
    </Link>
  ) : (
    <div className={classes}>{conteudo}</div>
  )
}
