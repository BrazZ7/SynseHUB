'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { ChartTooltip } from '@/components/synse/charts/chart-tooltip'
import { formatPace } from '@/features/synse-run/format'
import type { ActivitySplit } from '@/types/domain'

/**
 * Pace por quilômetro.
 *
 * Barras, e não linha: o pace é medido por quilômetro fechado, e uma linha
 * sugeriria um valor contínuo que não foi medido. O eixo é invertido porque em
 * corrida menor é melhor — barra alta tem de significar quilômetro rápido, ou
 * o gráfico engana quem bate o olho.
 */
export function PaceChart({
  splits,
  averagePace,
}: {
  splits: ActivitySplit[]
  averagePace: number | null
}) {
  const dados = splits.map((parcial) => ({
    km: `${parcial.kilometer}`,
    pace: Math.round(parcial.paceSeconds),
  }))

  const maior = Math.max(...dados.map((d) => d.pace))
  const menor = Math.min(...dados.map((d) => d.pace))

  return (
    <section className="rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm">
      <h2 className="text-sm font-semibold text-synse-text">Pace por quilômetro</h2>

      <div className="mt-4 h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dados} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--synse-border)" vertical={false} />
            <XAxis dataKey="km" tickLine={false} axisLine={false} fontSize={11} />
            <YAxis
              reversed
              domain={[Math.max(0, menor - 20), maior + 20]}
              tickFormatter={(valor: number) => formatPace(valor)}
              tickLine={false}
              axisLine={false}
              fontSize={11}
              width={52}
            />
            <Tooltip
              cursor={{ fill: 'var(--synse-surface-2)' }}
              content={<ChartTooltip formatValue={(valor) => `${formatPace(valor)}/km`} />}
            />
            {averagePace !== null && (
              <ReferenceLine
                y={Math.round(averagePace)}
                stroke="var(--synse-muted)"
                strokeDasharray="4 4"
              />
            )}
            <Bar dataKey="pace" fill="var(--synse-primary)" radius={[6, 6, 0, 0]} maxBarSize={44} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
