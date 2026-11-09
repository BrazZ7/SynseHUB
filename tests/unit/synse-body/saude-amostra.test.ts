import { describe, expect, it } from 'vitest'

import {
  PRIMEIRA_JANELA_DIAS,
  SOBREPOSICAO_DIAS,
  clientIdDaAmostra,
  ehEcoDoSynse,
  janelaDeImportacao,
} from '../../../src/features/synse-body/health/amostra'
import type { AmostraDeSaude } from '../../../src/features/synse-body/health/amostra'

const amostra = (parcial: Partial<AmostraDeSaude> = {}): AmostraDeSaude => ({
  idNaPlataforma: 'AAAA-BBBB',
  tipo: 'PESO',
  valor: 80,
  medidaEm: '2026-10-01T07:00:00.000Z',
  appDeOrigem: 'Mi Fit',
  aparelhoDeOrigem: null,
  ...parcial,
})

const DIA = 86_400_000

describe('o clientId da amostra', () => {
  it('é estável: a mesma amostra dá o mesmo id, importação após importação', () => {
    expect(clientIdDaAmostra('apple_health', 'AAAA-BBBB')).toBe(
      clientIdDaAmostra('apple_health', 'AAAA-BBBB'),
    )
  })

  it('separa as duas plataformas', () => {
    // O mesmo id de amostra nas duas plataformas são pesagens diferentes.
    expect(clientIdDaAmostra('apple_health', 'X')).not.toBe(
      clientIdDaAmostra('health_connect', 'X'),
    )
  })

  it('cabe no que o banco aceita, mesmo com id fora do comum', () => {
    const id = clientIdDaAmostra('health_connect', 'z'.repeat(200))
    expect(id.length).toBeLessThanOrEqual(64)
    expect(id.length).toBeGreaterThanOrEqual(8)
  })

  it('recusa amostra sem identificador em vez de inventar um', () => {
    // Um id gerado aqui quebraria a idempotência e duplicaria tudo na próxima.
    expect(() => clientIdDaAmostra('apple_health', '   ')).toThrow()
  })

  it('chega ao mínimo que o banco aceita, mesmo com id curtíssimo', () => {
    /*
     * Descoberto rodando a importação de ponta a ponta: o servidor recusava o
     * lote inteiro com "String must contain at least 8 character(s)".
     */
    for (const id of ['a', 'a1', 'xyz']) {
      expect(clientIdDaAmostra('health_connect', id).length).toBeGreaterThanOrEqual(8)
    }
  })

  it('id curto e id longo nunca produzem o mesmo clientId', () => {
    /*
     * A armadilha que o prefixo de comprimento existe para evitar: completar
     * com um caractere de enchimento faria `a1` e `a1---` virarem o mesmo
     * `clientId`, e a segunda pesagem sobrescreveria a primeira no banco.
     */
    const ids = ['a', 'a1', 'a1-', 'a1--', 'a1---', 'a1----', 'a100', '2-a1', 'xyz', 'xyz00']
    const gerados = ids.map((id) => clientIdDaAmostra('health_connect', id))

    expect(new Set(gerados).size).toBe(ids.length)
  })
})

describe('o eco do próprio Synse', () => {
  it('reconhece o que o Synse escreveu, em qualquer grafia', () => {
    for (const nome of ['Synse', 'synse', 'br.com.synse.app', 'Synse App']) {
      expect(ehEcoDoSynse(amostra({ appDeOrigem: nome }))).toBe(true)
    }
  })

  it('não confunde outro app com o Synse', () => {
    for (const nome of ['Mi Fit', 'Withings Health Mate', 'Zepp Life', null]) {
      expect(ehEcoDoSynse(amostra({ appDeOrigem: nome }))).toBe(false)
    }
  })
})

describe('a janela de importação', () => {
  const agora = new Date('2026-10-10T12:00:00.000Z')

  it('na primeira vez busca um ano, e diz que é a primeira', () => {
    const janela = janelaDeImportacao({ ultimaImportadaEm: null, agora })

    expect(janela.primeiraVez).toBe(true)
    expect(janela.ate).toEqual(agora)
    expect(Math.round((agora.getTime() - janela.de.getTime()) / DIA)).toBe(PRIMEIRA_JANELA_DIAS)
  })

  it('depois volta antes da última, para pegar a pesagem que sincronizou atrasada', () => {
    const ultima = new Date('2026-10-08T07:00:00.000Z')
    const janela = janelaDeImportacao({ ultimaImportadaEm: ultima.toISOString(), agora })

    expect(janela.primeiraVez).toBe(false)
    expect(Math.round((ultima.getTime() - janela.de.getTime()) / DIA)).toBe(SOBREPOSICAO_DIAS)
  })

  it('não traz dois anos de uma vez para quem sumiu e voltou', () => {
    /*
     * Sem o limite, a sobreposição aplicada a uma última importação de dois
     * anos atrás abriria uma janela de dois anos — a rajada que a primeira
     * janela existe para evitar.
     */
    const janela = janelaDeImportacao({ ultimaImportadaEm: '2024-01-01T00:00:00.000Z', agora })

    expect(Math.round((agora.getTime() - janela.de.getTime()) / DIA)).toBe(PRIMEIRA_JANELA_DIAS)
  })

  it('trata data ilegível como primeira vez, em vez de abrir janela inválida', () => {
    expect(janelaDeImportacao({ ultimaImportadaEm: 'ontem', agora }).primeiraVez).toBe(true)
  })
})
