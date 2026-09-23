import { describe, expect, it } from 'vitest'

import { DemoDataSource } from '@/lib/database/demo-data-source'
import { SEMANAS_DE_BASE, metaDaSemana } from '@/features/synse-run/goal'

/**
 * ── A vitrine que estava vazia ──────────────────────────────────────────────
 *
 * O SynseRun existe desde a 0016 e o dataset de demonstração não tinha uma
 * corrida sequer: quem abria a demonstração para decidir se compra via a aba
 * em branco e concluía que o recurso não existe. Mesmo defeito dos apelidos de
 * exercício — o dado nunca chegou à demonstração.
 *
 * Estes testes travam o que a tela precisa para não voltar a ficar vazia.
 */

const fonte = new DemoDataSource([])
const CORREDOR = 'prof_0001'
const DIA = 86_400_000

describe('as corridas da demonstração', () => {
  it('existem, e são do perfil da persona de aluno', async () => {
    const atividades = await fonte.listActivities(CORREDOR, { limit: 500 })
    expect(atividades.length).toBeGreaterThan(20)
    expect(atividades.every((a) => a.userProfileId === CORREDOR)).toBe(true)
  })

  it('não inventa corrida para outro perfil', async () => {
    expect(await fonte.listActivities('prof_staff_0006', { limit: 50 })).toEqual([])
  })

  it('vêm da mais recente para a mais antiga', async () => {
    const atividades = await fonte.listActivities(CORREDOR, { limit: 500 })
    const datas = atividades.map((a) => a.startedAt)
    expect(datas).toEqual([...datas].sort().reverse())
  })

  it('tem as quatro semanas fechadas que a meta exige', async () => {
    /*
     * `metaDaSemana` sai da média das quatro semanas anteriores. Sem elas a
     * barra da tela inicial não mostra alvo nenhum — que era o estado antes
     * desta semente.
     */
    const agora = Date.now()
    const base = new Date(agora - SEMANAS_DE_BASE * 7 * DIA).toISOString()
    const desdeABase = await fonte.summarizeActivities(CORREDOR, base)

    expect(desdeABase.activities).toBeGreaterThan(SEMANAS_DE_BASE)
    expect(metaDaSemana(desdeABase.distanceMeters / SEMANAS_DE_BASE)).not.toBeNull()
  })

  it('mistura corrida, caminhada e pedalada', async () => {
    const atividades = await fonte.listActivities(CORREDOR, { limit: 500 })
    const esportes = new Set(atividades.map((a) => a.sport))
    expect([...esportes].sort()).toEqual(['RIDE', 'RUN', 'WALK'])
  })

  it('cada atividade é coerente consigo mesma', async () => {
    const atividades = await fonte.listActivities(CORREDOR, { limit: 500 })
    for (const a of atividades) {
      expect(a.distanceMeters, a.id).toBeGreaterThan(0)
      expect(a.movingSeconds, a.id).toBeGreaterThan(0)
      // Relógio corrido inclui o parado no semáforo: nunca é menor.
      expect(a.elapsedSeconds, a.id).toBeGreaterThanOrEqual(a.movingSeconds)
      expect(a.status, a.id).toBe('COMPLETED')
      expect(a.averageSpeed, a.id).toBeCloseTo(a.distanceMeters / a.movingSeconds, 5)
      expect(a.maxSpeed, a.id).toBeGreaterThan(a.averageSpeed)
    }
  })

  it('as parciais somam o inteiro de quilômetros da atividade', async () => {
    const atividades = await fonte.listActivities(CORREDOR, { limit: 5 })
    for (const a of atividades) {
      const parciais = await fonte.getActivitySplits(a.id)
      expect(parciais.length, a.id).toBe(Math.floor(a.distanceMeters / 1000))
      expect(parciais.map((p) => p.kilometer)).toEqual(
        parciais.map((_, indice) => indice + 1),
      )
    }
  })

  it('as mais recentes têm rota, para a tela de detalhe não abrir sem mapa', async () => {
    const [primeira] = await fonte.listActivities(CORREDOR, { limit: 1 })
    const rota = await fonte.getActivityRoute(primeira.id)

    expect(rota.length).toBeGreaterThan(10)
    // A distância acumulada só cresce — é dela que a 0016 tira o recorde.
    const acumulada = rota.map((p) => p.totalDistance)
    expect(acumulada).toEqual([...acumulada].sort((a, b) => a - b))
  })
})

describe('os recordes da demonstração', () => {
  it('existem — antes disto a lista voltava vazia', async () => {
    const recordes = await fonte.listPersonalRecords(CORREDOR)
    expect(recordes.length).toBeGreaterThan(2)
  })

  it('ficam mais lentos conforme a distância cresce', async () => {
    /*
     * O defeito que a tela mostrou: 400 m e 10 km apareciam os dois a
     * 05:42/km, porque o tempo saía de regra de três sobre o ritmo médio.
     * Ninguém sustenta no dez mil o ritmo que faz no quilômetro — a fórmula
     * de Riegel é o que conserta, e este teste é o que impede a volta.
     */
    const recordes = await fonte.listPersonalRecords(CORREDOR)
    const ritmos = recordes.map((r) => r.paceSeconds)

    expect(ritmos.length).toBeGreaterThan(2)
    for (let i = 1; i < ritmos.length; i += 1) {
      expect(ritmos[i], `${recordes[i].distanceMeters} m`).toBeGreaterThan(ritmos[i - 1])
    }
  })

  it('só marca distância que foi de fato percorrida', async () => {
    const recordes = await fonte.listPersonalRecords(CORREDOR)
    const atividades = await fonte.listActivities(CORREDOR, { limit: 500 })
    const porId = new Map(atividades.map((a) => [a.id, a]))

    for (const recorde of recordes) {
      const atividade = porId.get(recorde.activityId)
      expect(atividade, recorde.id).toBeTruthy()
      expect(atividade!.distanceMeters).toBeGreaterThanOrEqual(recorde.distanceMeters)
      expect(atividade!.sport).toBe('RUN')
    }
  })

  it('não devolve recorde de quem não corre', async () => {
    expect(await fonte.listPersonalRecords('prof_staff_0006')).toEqual([])
  })
})
