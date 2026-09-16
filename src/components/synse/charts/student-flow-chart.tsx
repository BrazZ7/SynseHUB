'use client'

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { ChartLegend } from '@/components/synse/charts/chart-legend'
import { ChartTooltip } from '@/components/synse/charts/chart-tooltip'
import { AXIS_TICK, useChartPalette } from '@/components/synse/charts/chart-theme'
import { formatNumber } from '@/lib/utils'
import type { StudentFlowPoint } from '@/features/dashboard/service'

/** Novas matrículas × cancelamentos, mês a mês. */
export function StudentFlowChart({ data }: { data: StudentFlowPoint[] }) {
  const palette = useChartPalette()

  return (
    <div className="space-y-3">
      <ChartLegend
        items={[
          { label: 'Novas matrículas', color: palette.primary, shape: 'bar' },
          { label: 'Cancelamentos', color: palette.secondary, shape: 'bar' },
        ]}
      />

      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barGap={2}>
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
              allowDecimals={false}
              tick={{ ...AXIS_TICK, fill: palette.axis }}
            />
            <Tooltip
              cursor={{ fill: palette.grid }}
              content={<ChartTooltip formatValue={(value) => formatNumber(value)} />}
            />
            <Bar
              dataKey="joined"
              name="Novas matrículas"
              fill={palette.primary}
              radius={[4, 4, 0, 0]}
              maxBarSize={16}
            />
            <Bar
              dataKey="left"
              name="Cancelamentos"
              fill={palette.secondary}
              radius={[4, 4, 0, 0]}
              maxBarSize={16}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
