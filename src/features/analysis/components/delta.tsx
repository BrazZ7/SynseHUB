import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react'

import type { Variacao } from '@/features/analysis/metrics'
import { cn, formatNumber } from '@/lib/utils'

/**
 * A pílula de variação.
 *
 * ── Por que não há verde nem vermelho aqui ───────────────────────────────────
 *
 * A tentação é pintar subida de verde e queda de vermelho. Mas o motor
 * deliberadamente não dá veredito: menos volume com mais carga é progressão em
 * força e recuo em hipertrofia, e a tela não sabe o objetivo da pessoa. Pintar
 * seria dar o parecer que o cálculo se recusou a dar — e dar errado metade das
 * vezes.
 *
 * Quem sabe o sentido é quem usa o componente: `bomQuandoSobe` é opcional e
 * explícito, e sem ele a pílula fica neutra com a seta indicando a direção.
 */
export function Delta({
  variacao,
  unidade = '',
  bomQuandoSobe,
  casas = 0,
}: {
  variacao: Variacao
  unidade?: string
  /** Deixe indefinido quando subir não for necessariamente melhor. */
  bomQuandoSobe?: boolean
  casas?: number
}) {
  const parado = variacao.delta === 0
  const subiu = variacao.delta > 0

  const Seta = parado ? ArrowRight : subiu ? ArrowUpRight : ArrowDownRight

  const favoravel = bomQuandoSobe === undefined ? null : subiu === bomQuandoSobe
  const cor = parado
    ? 'text-synse-muted'
    : favoravel === null
      ? 'text-synse-text'
      : favoravel
        ? 'text-synse-primary'
        : 'text-synse-muted'

  const sinal = subiu ? '+' : ''
  const numero = formatNumber(variacao.delta, {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  })

  return (
    <span className={cn('inline-flex items-center gap-1 text-xs tabular-nums', cor)}>
      <Seta className="size-3.5 shrink-0" aria-hidden />
      <span>
        {sinal}
        {numero}
        {unidade}
      </span>
      {/*
        O percentual some para quem partiu do zero: `variacao` devolve `null` de
        propósito ali, e imprimir "—%" no lugar não acrescenta nada.
      */}
      {variacao.percentual != null && !parado && (
        <span className="text-synse-muted">
          ({sinal}
          {formatNumber(variacao.percentual, { maximumFractionDigits: 1 })}%)
        </span>
      )}
    </span>
  )
}
