import { describe, expect, it } from 'vitest'

import { boundsOf, haversineDistance } from '@/features/synse-run/engine/geo'
import type { RawPoint } from '@/features/synse-run/engine/types'

const ponto = (latitude: number, longitude: number): RawPoint => ({
  latitude,
  longitude,
  altitude: null,
  accuracy: 5,
  speed: null,
  heading: null,
  timestamp: 0,
})

describe('haversineDistance', () => {
  /*
   * Distâncias conferidas contra valores conhecidos. Um erro de fator — grau
   * onde deveria ser radiano, raio em quilômetro onde deveria ser metro —
   * passa despercebido em teste sintético e só aparece quando alguém corre.
   */
  it('mede um grau de latitude como ~111 km', () => {
    expect(haversineDistance(ponto(0, 0), ponto(1, 0))).toBeCloseTo(111_195, -2)
  })

  it('mede um grau de longitude no equador como ~111 km', () => {
    expect(haversineDistance(ponto(0, 0), ponto(0, 1))).toBeCloseTo(111_195, -2)
  })

  it('encolhe o grau de longitude conforme sobe a latitude', () => {
    // Em 60° de latitude, um grau de longitude vale metade do equador.
    const noEquador = haversineDistance(ponto(0, 0), ponto(0, 1))
    const em60 = haversineDistance(ponto(60, 0), ponto(60, 1))
    expect(em60 / noEquador).toBeCloseTo(0.5, 2)
  })

  it('São Paulo → Rio de Janeiro dá cerca de 360 km', () => {
    const distancia = haversineDistance(ponto(-23.5505, -46.6333), ponto(-22.9068, -43.1729))
    expect(distancia / 1000).toBeGreaterThan(355)
    expect(distancia / 1000).toBeLessThan(365)
  })

  it('mesmo ponto é distância zero', () => {
    expect(haversineDistance(ponto(-23.5, -46.6), ponto(-23.5, -46.6))).toBe(0)
  })

  it('cem metros continuam cem metros', () => {
    // 0,000899° de latitude ≈ 100 m.
    expect(haversineDistance(ponto(-23.5, -46.6), ponto(-23.499101, -46.6))).toBeCloseTo(100, 0)
  })
})

describe('boundsOf', () => {
  it('enquadra todos os pontos', () => {
    expect(boundsOf([ponto(-23.5, -46.6), ponto(-23.4, -46.7), ponto(-23.6, -46.5)])).toEqual({
      north: -23.4,
      south: -23.6,
      east: -46.5,
      west: -46.7,
    })
  })

  it('sem pontos, não há enquadramento', () => {
    expect(boundsOf([])).toBeNull()
  })
})
