'use client'

import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { ChartLegend } from '@/components/synse/charts/chart-legend'
import { ChartTooltip } from '@/components/synse/charts/chart-tooltip'
import { AXIS_TICK, useChartPalette } from '@/components/synse/charts/chart-theme'
import { formatCurrency, formatCurrencyCompact } from '@/lib/utils'
import type { MonthlyRevenuePoint } from '@/features/dashboard/service'

/**
 * Receita nos últimos 12 meses.
 *
 * Duas séries com encodings distintos — área para o recebido (a tendência) e
 * barra para o pendente (um estoque pontual). A diferença de forma mantém as
 * séries distinguíveis mesmo sem percepção de cor.
 */
export function RevenueChart({ data }: { data: MonthlyRevenuePoint[] }) {
  const palette = useChartPalette()

  return (
    <div className="space-y-3">
      <ChartLegend
        items={[
          { label: 'Recebido', color: palette.primary, shape: 'line' },
          { label: 'Em aberto', color: palette.warning, shape: 'bar' },
        ]}
      />

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="synseRevenueFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={palette.primary} stopOpacity={0.22} />
                <stop offset="100%" stopColor={palette.primary} stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <CartesianGrid vertical={false} stroke={palette.grid} strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ ...AXIS_TICK, fill: palette.axis }}
              dy={6}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width="auto"
              tick={{ ...AXIS_TICK, fill: palette.axis }}
              tickFormatter={(value: number) => formatCurrencyCompact(value)}
            />
            <Tooltip
              cursor={{ fill: palette.grid }}
              content={<ChartTooltip formatValue={(value) => formatCurrency(value)} />}
            />

            <Bar
              dataKey="pending"
              name="Em aberto"
              fill={palette.warning}
              radius={[4, 4, 0, 0]}
              maxBarSize={14}
            />
            <Area
              type="monotone"
              dataKey="received"
              name="Recebido"
              stroke={palette.primary}
              strokeWidth={2}
              fill="url(#synseRevenueFill)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: palette.surface }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
