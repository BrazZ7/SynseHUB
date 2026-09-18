import { describe, expect, it } from 'vitest'

import {
  XP_POR_MEDALHA,
  XP_POR_QUILOMETRO,
  XP_POR_TREINO,
  calcularNivel,
  calcularXp,
  nivelDe,
  xpDoNivel,
} from '@/features/students/level'

/**
 * O nível Synse.
 *
 * Ele é derivado do histórico, e é isso que estes testes protegem: o mesmo
 * histórico precisa dar sempre o mesmo nível, em qualquer lugar que faça a
 * conta. Um nível que oscila entre duas telas é pior que nenhum nível.
 */

describe('o XP', () => {
  it('soma o que a pessoa fez, com os pesos declarados', () => {
    expect(calcularXp({ treinos: 10, quilometros: 20, medalhas: 2 })).toBe(
      10 * XP_POR_TREINO + 20 * XP_POR_QUILOMETRO + 2 * XP_POR_MEDALHA,
    )
  })

  it('quem não fez nada tem zero, e não um número negativo', () => {
    expect(calcularXp({ treinos: 0, quilometros: 0, medalhas: 0 })).toBe(0)
    expect(calcularXp({ treinos: -5, quilometros: -3, medalhas: 0 })).toBe(0)
  })

  it('quilômetro quebrado conta proporcional, e arredonda uma vez só', () => {
    expect(calcularXp({ treinos: 0, quilometros: 42.7, medalhas: 0 })).toBe(427)
  })
})

describe('o nível', () => {
  it('quem está começando é nível 1', () => {
    expect(calcularNivel(0).nivel).toBe(1)
    expect(calcularNivel(10).nivel).toBe(1)
  })

  it('vira de nível exatamente quando completa a banda', () => {
    const banda1 = xpDoNivel(1)
    expect(calcularNivel(banda1 - 1).nivel).toBe(1)
    expect(calcularNivel(banda1).nivel).toBe(2)
  })

  it('o que falta mais o que já tem fecha a banda', () => {
    const n = calcularNivel(3_500)
    expect(n.xpNoNivel + n.falta).toBe(n.xpDoNivel)
  })

  it('a barra nunca passa de cheia nem fica negativa', () => {
    for (const xp of [0, 1, 999, 5_000, 250_000]) {
      const n = calcularNivel(xp)
      expect(n.progresso).toBeGreaterThanOrEqual(0)
      expect(n.progresso).toBeLessThanOrEqual(1)
    }
  })

  it('cada nível pede mais que o anterior', () => {
    for (let i = 1; i < 30; i += 1) {
      expect(xpDoNivel(i + 1)).toBeGreaterThan(xpDoNivel(i))
    }
  })

  it('XP absurdo não prende a renderização num laço', () => {
    /*
     * Dado corrompido não pode travar a tela de perfil. O teto corta em 500 e
     * a função devolve alguma coisa, em vez de rodar para sempre.
     */
    const n = calcularNivel(Number.MAX_SAFE_INTEGER)
    expect(n.nivel).toBeLessThanOrEqual(500)
    expect(Number.isFinite(n.progresso)).toBe(true)
  })

  it('o mesmo histórico dá sempre o mesmo nível', () => {
    const fonte = { treinos: 18, quilometros: 42.7, medalhas: 4 }
    expect(nivelDe(fonte)).toEqual(nivelDe(fonte))
  })
})
