import { describe, expect, it } from 'vitest'

import {
  DEGRAU_MAXIMO,
  META_MINIMA_METROS,
  metaDaSemana,
  progressoDaMeta,
} from '@/features/synse-run/goal'

describe('metaDaSemana', () => {
  it('não inventa alvo para quem ainda não tem histórico', () => {
    expect(metaDaSemana(0)).toBeNull()
    expect(metaDaSemana(-10)).toBeNull()
    expect(metaDaSemana(Number.NaN)).toBeNull()
    expect(metaDaSemana(Number.POSITIVE_INFINITY)).toBeNull()
  })

  it('respeita o piso de 5 km', () => {
    expect(metaDaSemana(400)).toBe(META_MINIMA_METROS)
    expect(metaDaSemana(4_900)).toBe(META_MINIMA_METROS)
  })

  it('sobe de 1 em 1 km para semanas curtas', () => {
    // 6,2 km de média vira 7 km, e não 10: dobrar a meta de quem começa afasta.
    expect(metaDaSemana(6_200)).toBe(7_000)
    expect(metaDaSemana(9_100)).toBe(10_000)
  })

  it('sobe de 5 em 5 km na faixa do meio', () => {
    // O caso do desenho: 28 km de média vira 30, não 50.
    expect(metaDaSemana(28_000)).toBe(30_000)
    expect(metaDaSemana(12_500)).toBe(15_000)
  })

  it('sobe de 10 em 10 km para quem corre muito', () => {
    expect(metaDaSemana(41_000)).toBe(50_000)
    expect(metaDaSemana(80_000)).toBe(80_000)
    expect(metaDaSemana(80_001)).toBe(80_000 + DEGRAU_MAXIMO)
  })

  it('não recua quando a média já é um número redondo', () => {
    // Semana média exata: a meta é manter, não superar.
    expect(metaDaSemana(30_000)).toBe(30_000)
    expect(metaDaSemana(10_000)).toBe(10_000)
  })
})

describe('progressoDaMeta', () => {
  it('trava a barra em 1 mas deixa o número passar de 100', () => {
    // O defeito do cartão de medalha: um valor só para a barra e para o texto.
    const { fracao, percentual } = progressoDaMeta(42_000, 30_000)
    expect(fracao).toBe(1)
    expect(percentual).toBe(140)
  })

  it('calcula a fração parcial', () => {
    expect(progressoDaMeta(15_000, 30_000)).toEqual({ fracao: 0.5, percentual: 50 })
  })

  it('não vai a negativo', () => {
    expect(progressoDaMeta(-5_000, 30_000)).toEqual({ fracao: 0, percentual: 0 })
  })

  it('devolve zero em vez de dividir por zero', () => {
    expect(progressoDaMeta(10_000, 0)).toEqual({ fracao: 0, percentual: 0 })
    expect(progressoDaMeta(Number.NaN, 30_000)).toEqual({ fracao: 0, percentual: 0 })
  })
})
