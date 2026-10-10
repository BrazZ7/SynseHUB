import { describe, expect, it } from 'vitest'

import { calcularConquistas, estanteDeConquistas } from '@/features/students/achievements'

/**
 * As conquistas.
 *
 * São função do histórico, e é isso que importa aqui: ninguém fica com uma
 * conquista que o histórico não sustenta, e o "quanto falta" precisa falar na
 * unidade certa — dizer "faltam 2 km" num marco que conta treinos é pior que
 * não dizer nada.
 */

const zerado = {
  treinos: 0,
  quilometros: 0,
  maiorSequencia: 0,
  medalhas: 0,
  maiorCargaKg: 0,
  desafiosConcluidos: 0,
}

const achar = (historico: typeof zerado, code: string) =>
  calcularConquistas(historico).find((c) => c.code === code)!

describe('conceder', () => {
  it('quem não fez nada não tem nenhuma', () => {
    expect(calcularConquistas(zerado).every((c) => !c.conquistada)).toBe(true)
  })

  it('o primeiro treino concede no primeiro treino', () => {
    expect(achar({ ...zerado, treinos: 1 }, 'PRIMEIRO_TREINO').conquistada).toBe(true)
  })

  it('o marco concede exatamente no alvo, não só acima dele', () => {
    expect(achar({ ...zerado, quilometros: 4.9 }, 'CORRIDA_5K').conquistada).toBe(false)
    expect(achar({ ...zerado, quilometros: 5 }, 'CORRIDA_5K').conquistada).toBe(true)
  })

  it('a sequência olha a maior já feita, não a de agora', () => {
    // Quem já fez sete dias seguidos não perde a conquista ao faltar hoje.
    expect(achar({ ...zerado, maiorSequencia: 7 }, 'SEQUENCIA_7').conquistada).toBe(true)
  })
})

describe('o quanto falta', () => {
  it('fala na unidade do marco', () => {
    expect(achar({ ...zerado, quilometros: 2 }, 'CORRIDA_5K').progresso).toBe('Faltam 3.0 km')
    expect(achar({ ...zerado, maiorSequencia: 4 }, 'SEQUENCIA_7').progresso).toBe('Faltam 3 dias')
    expect(achar({ ...zerado, maiorCargaKg: 80 }, 'CARGA_100').progresso).toBe('Faltam 20 kg')
  })

  it('conquistada não mostra progresso', () => {
    expect(achar({ ...zerado, treinos: 5 }, 'PRIMEIRO_TREINO').progresso).toBeNull()
  })
})

describe('a estante', () => {
  it('mostra as conquistadas e uma por conquistar', () => {
    /*
     * Todas as pendentes viraria lista de tarefas; nenhuma tiraria o próximo
     * passo de vista. Uma é o meio-termo.
     */
    const estante = estanteDeConquistas({ ...zerado, treinos: 3, quilometros: 6 })
    const pendentes = estante.filter((c) => !c.conquistada)

    expect(estante.filter((c) => c.conquistada).length).toBe(2)
    expect(pendentes).toHaveLength(1)
    expect(estante.at(-1)?.conquistada).toBe(false)
  })

  it('respeita o limite da tela', () => {
    const tudo = {
      treinos: 50,
      quilometros: 500,
      maiorSequencia: 40,
      medalhas: 10,
      maiorCargaKg: 200,
      desafiosConcluidos: 9,
    }
    expect(estanteDeConquistas(tudo, 5).length).toBeLessThanOrEqual(5)
  })

  it('quem não tem nenhuma ainda vê o primeiro marco a buscar', () => {
    const estante = estanteDeConquistas(zerado)
    expect(estante).toHaveLength(1)
    expect(estante[0].conquistada).toBe(false)
  })
})
