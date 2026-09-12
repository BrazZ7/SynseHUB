/**
 * Números de corrida em texto.
 *
 * Toda conversão de unidade mora aqui. O motor e o banco falam metro, segundo
 * e m/s; a tela fala quilômetro, `05:32/km` e km/h. Espalhar essa conversão
 * pelas telas é como se erra por 3,6 em um lugar só e ninguém percebe.
 */

/** 5734 → "5,73" */
export function formatDistance(metros: number, casas = 2): string {
  return (metros / 1000).toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  })
}

/** 3742 → "01:02:22"; 1842 → "30:42" */
export function formatDuration(segundos: number): string {
  const total = Math.max(0, Math.round(segundos))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const dois = (valor: number) => String(valor).padStart(2, '0')

  return h > 0 ? `${dois(h)}:${dois(m)}:${dois(s)}` : `${dois(m)}:${dois(s)}`
}

/**
 * 332 → "05:32"
 *
 * Pace zerado não vira "00:00": vira travessão. Zero significa que ainda não
 * há distância para dividir, e mostrar 00:00 sugere velocidade infinita.
 */
export function formatPace(segundosPorKm: number | null): string {
  if (segundosPorKm === null || !Number.isFinite(segundosPorKm) || segundosPorKm <= 0)
    return '--:--'

  const total = Math.round(segundosPorKm)
  const minutos = Math.floor(total / 60)
  const segundos = total % 60

  // Acima de 20 min/km é caminhada muito lenta ou GPS confuso: o número perde
  // sentido antes de perder precisão.
  if (minutos > 99) return '--:--'

  return `${String(minutos).padStart(2, '0')}:${String(segundos).padStart(2, '0')}`
}

/** m/s → "11,3" */
export function formatSpeed(metrosPorSegundo: number): string {
  return (metrosPorSegundo * 3.6).toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
}

/** Diferença de pace contra a média: "11s mais rápido". */
export function formatPaceDelta(paceParcial: number, paceMedio: number): string | null {
  const diferenca = Math.round(paceParcial - paceMedio)
  if (Math.abs(diferenca) < 2) return null
  return diferenca < 0 ? `${Math.abs(diferenca)}s mais rápido` : `${diferenca}s mais lento`
}

/** 21097 → "21,1 km"; 1609 → "1 milha"; 400 → "400 m" */
export function formatRecordDistance(metros: number): string {
  if (metros === 1609) return '1 milha'
  if (metros === 21097) return 'Meia maratona'
  if (metros === 42195) return 'Maratona'
  if (metros < 1000) return `${metros} m`
  return `${(metros / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`
}

export const SPORT_LABELS = {
  RUN: 'Corrida',
  WALK: 'Caminhada',
  RIDE: 'Ciclismo',
} as const
