'use client'

import { useEffect, useState } from 'react'

/**
 * Paleta dos gráficos.
 *
 * Os passos foram validados com o verificador de paleta em ambos os temas
 * (banda de luminosidade, piso de croma, separação para daltonismo e contraste
 * contra a superfície do card). O tema escuro tem passos próprios — não é uma
 * inversão automática do claro.
 *
 *   claro  (superfície #FFFFFF): âmbar #E7A52B · turquesa #00A98F · índigo #5B5BD6
 *   escuro (superfície #082925): âmbar #B2893F · turquesa #129981 · índigo #6C68BB
 *
 * A ordem é fixa e ligada ao significado da série, nunca ao seu posto no
 * ranking: um filtro que remova uma série não repinta as demais.
 */
export type ChartPalette = {
  primary: string
  warning: string
  secondary: string
  grid: string
  axis: string
  surface: string
  tooltipBorder: string
}

const LIGHT: ChartPalette = {
  primary: '#00A98F',
  warning: '#E7A52B',
  secondary: '#5B5BD6',
  grid: 'rgba(16, 43, 41, 0.08)',
  axis: '#69817D',
  surface: '#FFFFFF',
  tooltipBorder: 'rgba(16, 43, 41, 0.10)',
}

const DARK: ChartPalette = {
  primary: '#129981',
  warning: '#B2893F',
  secondary: '#6C68BB',
  grid: 'rgba(191, 245, 229, 0.10)',
  axis: '#8FAAA4',
  surface: '#082925',
  tooltipBorder: 'rgba(191, 245, 229, 0.14)',
}

/** Observa a classe `dark` no `<html>` e devolve a paleta correspondente. */
export function useChartPalette(): ChartPalette {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const root = document.documentElement
    const sync = () => setDark(root.classList.contains('dark'))
    sync()

    const observer = new MutationObserver(sync)
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  return dark ? DARK : LIGHT
}

export const AXIS_TICK = { fontSize: 11, fontWeight: 500 } as const
