import { Cpu, Calculator, Minus, Sparkles } from 'lucide-react'

import { EXPLICACAO_DA_ORIGEM, ROTULOS } from '@/features/synse-body/state'
import { cn } from '@/lib/utils'
import type { FieldOrigin } from '@/types/domain'

/**
 * Um número com a procedência dele.
 *
 * O ícone e a legenda não são enfeite. Uma balança de bioimpedância mede peso
 * e impedância; gordura, água e massa muscular saem de uma fórmula que o
 * fabricante não publica. Mostrar os dois com a mesma tipografia faria a
 * estimativa parecer ter a autoridade da medição — e é sobre esses números que
 * a pessoa decide o que comer.
 */

const ICONE: Record<FieldOrigin, typeof Cpu> = {
  MEASURED: Cpu,
  ESTIMATED: Sparkles,
  CALCULATED: Calculator,
  ABSENT: Minus,
}

const COR: Record<FieldOrigin, string> = {
  MEASURED: 'text-synse-text',
  ESTIMATED: 'text-synse-text',
  CALCULATED: 'text-synse-text',
  ABSENT: 'text-synse-muted',
}

export function MeasurementField({
  campo,
  valor,
  origem,
  destaque = false,
}: {
  campo: string
  valor: number | null | undefined
  origem: FieldOrigin | undefined
  destaque?: boolean
}) {
  const rotulo = ROTULOS[campo]
  if (!rotulo) return null

  const procedencia: FieldOrigin = origem ?? (valor == null ? 'ABSENT' : 'MEASURED')
  const Icone = ICONE[procedencia]

  return (
    <div className="rounded-lg border border-synse-border bg-synse-surface p-4">
      <p className="text-xs text-synse-muted">{rotulo.nome}</p>
      <p
        className={cn(
          'mt-1 font-semibold tabular-nums',
          destaque ? 'text-3xl' : 'text-xl',
          COR[procedencia],
        )}
      >
        {valor == null ? '—' : valor.toFixed(rotulo.casas)}
        {valor != null && rotulo.unidade && (
          <span className="ml-1 text-sm font-normal text-synse-muted">{rotulo.unidade}</span>
        )}
      </p>
      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-synse-muted">
        <Icone className="size-3 shrink-0" aria-hidden />
        {EXPLICACAO_DA_ORIGEM[procedencia]}
      </p>
    </div>
  )
}
