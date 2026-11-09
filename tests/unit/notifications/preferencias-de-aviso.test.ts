import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  CATEGORIAS_NA_TELA,
  estadoDasCategorias,
  quantasDesligadas,
} from '@/features/notifications/preferencias-state'
import type { NotificationCategory, NotificationPreference } from '@/types/domain'

/**
 * As preferências de aviso, do lado da tela.
 *
 * A regra que importa é **ausência é ligado**. A tabela guarda escolha, não
 * estado: quem nunca mexeu não tem linha e recebe tudo. Partir de "desligado"
 * mostraria a tela inteira apagada para quem está recebendo avisos
 * normalmente — e a pessoa ligaria o que já estava ligado, achando que
 * consertou algo.
 */

const pref = (category: NotificationCategory, enabled: boolean): NotificationPreference => ({
  category,
  enabled,
})

describe('o estado dos interruptores', () => {
  it('sem nenhuma escolha, tudo ligado', () => {
    const estado = estadoDasCategorias([])
    expect(estado).toHaveLength(CATEGORIAS_NA_TELA.length)
    expect(estado.every((c) => c.ligada)).toBe(true)
  })

  it('só a categoria desligada aparece desligada', () => {
    const estado = estadoDasCategorias([pref('PAYMENT', false)])
    expect(estado.find((c) => c.valor === 'PAYMENT')?.ligada).toBe(false)
    expect(estado.filter((c) => c.valor !== 'PAYMENT').every((c) => c.ligada)).toBe(true)
  })

  it('linha ligada é o mesmo que linha nenhuma', () => {
    expect(estadoDasCategorias([pref('PAYMENT', true)]).every((c) => c.ligada)).toBe(true)
  })

  it('a ordem da tela não depende do que veio do banco', () => {
    /*
     * As preferências chegam sem ordem garantida. A lista da tela é a de
     * `CATEGORIAS_NA_TELA`, que foi escolhida — treino primeiro, porque é o
     * aviso que a pessoa mais espera.
     */
    const baguncada = [pref('PROGRAM', false), pref('WORKOUT', false)]
    expect(estadoDasCategorias(baguncada).map((c) => c.valor)).toEqual(
      CATEGORIAS_NA_TELA.map((c) => c.valor),
    )
  })

  it('preferência de categoria que a tela não mostra é ignorada', () => {
    // `SYSTEM` não está na tela. Uma linha dela não pode sumir com nada.
    const estado = estadoDasCategorias([pref('SYSTEM', false)])
    expect(estado.every((c) => c.ligada)).toBe(true)
  })
})

describe('quantas desligadas', () => {
  it('conta só as da tela', () => {
    expect(quantasDesligadas([])).toBe(0)
    expect(quantasDesligadas([pref('PAYMENT', false), pref('GYM', false)])).toBe(2)
    expect(quantasDesligadas([pref('SYSTEM', false)])).toBe(0)
  })
})

describe('a lista da tela', () => {
  it('toda categoria tem rótulo e ajuda', () => {
    for (const c of CATEGORIAS_NA_TELA) {
      expect(c.rotulo, c.valor).toBeTruthy()
      expect(c.ajuda, c.valor).toBeTruthy()
    }
  })

  it('não repete categoria', () => {
    const valores = CATEGORIAS_NA_TELA.map((c) => c.valor)
    expect(new Set(valores).size).toBe(valores.length)
  })

  it('`SYSTEM` fica de fora, e isso é a decisão — não esquecimento', () => {
    /*
     * Aviso de conta e segurança. O banco aceita a preferência para ela; a
     * trava é esta lista. Se um dia `SYSTEM` carregar aviso dispensável, é
     * aqui que ela entra — e este teste é quem obriga a decisão a ser
     * consciente em vez de acidental.
     */
    expect(CATEGORIAS_NA_TELA.map((c) => c.valor)).not.toContain('SYSTEM')
  })

  it('cobre todas as categorias que o banco emite hoje', () => {
    /*
     * Lido das próprias migrations: uma categoria que algum gatilho emite e
     * que a tela não lista é um aviso que ninguém consegue desligar, sem erro
     * em lugar nenhum.
     */
    const dir = join(__dirname, '..', '..', '..', 'src/db/migrations')
    const sql = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => readFileSync(join(dir, f), 'utf8'))
      .join('\n')

    const emitidas = new Set<NotificationCategory>()
    for (const trecho of sql.split('notify_profiles(').slice(1)) {
      const achado = trecho.slice(0, 400).match(/'(PAYMENT|WORKOUT|GYM|CONTENT|PROGRAM|SYSTEM)'/)
      if (achado) emitidas.add(achado[1] as NotificationCategory)
    }

    expect(emitidas.size).toBeGreaterThan(0)
    const naTela = new Set(CATEGORIAS_NA_TELA.map((c) => c.valor))
    expect([...emitidas].filter((c) => !naTela.has(c))).toEqual([])
  })
})
