'use client'

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { ChartTooltip } from '@/components/synse/charts/chart-tooltip'
import { AXIS_TICK, useChartPalette } from '@/components/synse/charts/chart-theme'

export type ProgressPoint = { label: string; value: number }

/** Evolução de uma métrica única (carga, peso, medida). */
export function ProgressLineChart({
  data,
  unit = '',
  height = 200,
}: {
  data: ProgressPoint[]
  unit?: string
  height?: number
}) {
  const palette = useChartPalette()

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
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
            width={46}
            domain={['dataMin - 2', 'dataMax + 2']}
            tick={{ ...AXIS_TICK, fill: palette.axis }}
          />
          <Tooltip
            cursor={{ stroke: palette.grid, strokeWidth: 2 }}
            content={<ChartTooltip formatValue={(value) => `${value}${unit}`} />}
          />
          <Line
            type="monotone"
            dataKey="value"
            name="Evolução"
            stroke={palette.primary}
            strokeWidth={2}
            dot={{ r: 3, strokeWidth: 0, fill: palette.primary }}
            activeDot={{ r: 5, strokeWidth: 2, stroke: palette.surface }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
