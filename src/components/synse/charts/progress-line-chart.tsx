'use client'

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { ChartTooltip } from '@/components/synse/charts/chart-tooltip'
import { AXIS_TICK, useChartPalette } from '@/components/synse/charts/chart-theme'
import { escalaAgradavel } from '@/components/synse/charts/escala'

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
  /*
   * O eixo saía do dado cru e marcava 53,45 · 48,1 · 42,1. Número de eixo
   * existe para localizar o valor de relance, e para isso precisa ser redondo.
   */
  const escala = escalaAgradavel(data.map((ponto) => ponto.value))

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          {/*
            Fio contínuo, e não tracejado: o tracejado soma ruído e lê como
            "projeção" ou "limite" quando é só grade.
          */}
          <CartesianGrid vertical={false} stroke={palette.grid} />
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
            domain={[escala.min, escala.max]}
            ticks={escala.marcas}
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
