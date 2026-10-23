import { describe, expect, it } from 'vitest'

import { recalculateFromRoute } from '@/features/synse-run/engine/recalculate'

import { GpsSimulator } from './simulator'

/**
 * O servidor não pode acreditar no que o aparelho diz.
 *
 * Sem recálculo, "correr" uma maratona é um `fetch` com o número certo — e o
 * ranking da academia vira ficção. A rota é a única parte difícil de falsificar
 * de forma coerente, e é por isso que ela manda.
 */
function rotaDe(velocidade: number, segundos: number, altitudePorPonto = 0) {
  const gps = new GpsSimulator()
  const pontos = gps.correr(velocidade, segundos)

  return pontos.map((ponto, indice) => ({
    latitude: ponto.latitude,
    longitude: ponto.longitude,
    altitude: (ponto.altitude ?? 0) + indice * altitudePorPonto,
    speed: null,
    accuracy: ponto.accuracy,
    heading: null,
    recordedAt: new Date(ponto.timestamp).toISOString(),
  }))
}

describe('recalculateFromRoute', () => {
  it('mede a rota, ignorando o que o aparelho afirmou', () => {
    const conferido = recalculateFromRoute({
      route: rotaDe(3, 600),
      sport: 'RUN',
      reportedMovingSeconds: 600,
    })

    expect(conferido.distanceMeters).toBeGreaterThan(1780)
    expect(conferido.distanceMeters).toBeLessThan(1810)
    expect(conferido.averagePace).toBeGreaterThan(325)
    expect(conferido.averagePace).toBeLessThan(345)
    expect(conferido.splits).toHaveLength(1)
  })

  it('tempo em movimento não passa do tempo total da rota', () => {
    const conferido = recalculateFromRoute({
      route: rotaDe(3, 600),
      // O aparelho alega ter se movido cinco horas numa corrida de dez minutos.
      reportedMovingSeconds: 18_000,
      sport: 'RUN',
    })

    expect(conferido.movingSeconds).toBeLessThanOrEqual(conferido.elapsedSeconds)
    expect(conferido.elapsedSeconds).toBeCloseTo(599, 0)
  })

  it('rota vazia não vira atividade com número', () => {
    const conferido = recalculateFromRoute({ route: [], sport: 'RUN', reportedMovingSeconds: 3600 })

    expect(conferido.distanceMeters).toBe(0)
    expect(conferido.movingSeconds).toBe(0)
    expect(conferido.averagePace).toBeNull()
    expect(conferido.calories).toBe(0)
  })

  it('conta a subida e ignora a oscilação', () => {
    const subida = recalculateFromRoute({
      route: rotaDe(3, 300, 0.5),
      sport: 'RUN',
      reportedMovingSeconds: 300,
    })
    expect(subida.elevationGain).toBeGreaterThan(100)

    const plana = recalculateFromRoute({
      route: rotaDe(3, 300),
      sport: 'RUN',
      reportedMovingSeconds: 300,
    })
    expect(plana.elevationGain).toBe(0)
  })

  it('um pico de GPS não vira velocidade máxima', () => {
    const rota = rotaDe(3, 120)
    // Um ponto 60 m adiante em um segundo: 216 km/h se medido sozinho.
    rota.splice(60, 0, {
      ...rota[60],
      latitude: rota[60].latitude + 60 / 111_195,
      recordedAt: new Date(new Date(rota[60].recordedAt).getTime() + 500).toISOString(),
    })

    const conferido = recalculateFromRoute({
      route: rota,
      sport: 'RUN',
      reportedMovingSeconds: 120,
    })

    // A janela de dez segundos dilui o pico: sobra um valor plausível.
    expect(conferido.maxSpeed).toBeLessThan(12)
  })
})

describe('payload forjado', () => {
  /*
   * O ataque óbvio contra um ranking: mandar poucos pontos muito distantes e
   * declarar uma maratona. Recalcular sem filtro aceitaria — a geometria seria
   * coerente com os números.
   */
  it('rota com teletransporte não vira distância', () => {
    const inicio = new Date('2026-09-12T10:00:00.000Z').getTime()

    const rota = [0, 1, 2, 3].map((i) => ({
      // Um grau de latitude por ponto: 111 km a cada segundo.
      latitude: -23.5 + i,
      longitude: -46.6,
      altitude: null,
      speed: null,
      accuracy: 5,
      heading: null,
      recordedAt: new Date(inicio + i * 1000).toISOString(),
    }))

    const conferido = recalculateFromRoute({
      route: rota,
      sport: 'RUN',
      reportedMovingSeconds: 3,
    })

    expect(conferido.distanceMeters).toBe(0)
    expect(conferido.calories).toBe(0)
  })

  it('carimbo fora de ordem não vira distância negativa nem infinita', () => {
    const inicio = new Date('2026-09-12T10:00:00.000Z').getTime()

    const rota = [0, 1, 2].map((i) => ({
      latitude: -23.5 + i * 0.0009,
      longitude: -46.6,
      altitude: null,
      speed: null,
      accuracy: 5,
      heading: null,
      // Todos no mesmo instante: velocidade seria divisão por zero.
      recordedAt: new Date(inicio).toISOString(),
    }))

    const conferido = recalculateFromRoute({
      route: rota,
      sport: 'RUN',
      reportedMovingSeconds: 60,
    })

    expect(Number.isFinite(conferido.distanceMeters)).toBe(true)
    expect(conferido.distanceMeters).toBe(0)
    expect(conferido.movingSeconds).toBe(0)
  })
})
