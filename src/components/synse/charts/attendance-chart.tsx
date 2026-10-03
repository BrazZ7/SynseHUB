'use client'

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { ChartTooltip } from '@/components/synse/charts/chart-tooltip'
import { AXIS_TICK, useChartPalette } from '@/components/synse/charts/chart-theme'
import { formatNumber } from '@/lib/utils'
import type { AttendancePoint } from '@/features/dashboard/service'

/**
 * Frequência dos últimos 14 dias. Série única — o título já a nomeia, então
 * não existe legenda para repetir a mesma informação.
 */
export function AttendanceChart({ data }: { data: AttendancePoint[] }) {
  const palette = useChartPalette()

  return (
    <div className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={palette.grid} strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
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
            content={<ChartTooltip formatValue={(value) => `${formatNumber(value)} check-ins`} />}
          />
          <Bar
            dataKey="checkIns"
            name="Check-ins"
            fill={palette.primary}
            radius={[4, 4, 0, 0]}
            maxBarSize={22}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
