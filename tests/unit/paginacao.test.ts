import { describe, expect, it } from 'vitest'

import { estadoDaPaginacao } from '@/components/synse/pagination-state'

/**
 * ── A barra de paginação ────────────────────────────────────────────────────
 *
 * Ela se escondia sempre que havia uma página só — e isso parecia certo até
 * alguém chegar em `?page=2` de uma lista que encolheu. Aí a seção vinha
 * **vazia e sem botão de voltar**: nenhum item, nenhuma barra, nenhuma pista
 * de que a página pedida estava fora da lista.
 *
 * Acontece de três jeitos, nenhum deles exótico: link antigo salvo, lead ou
 * aluno que mudou de lista desde a última visita, e `?page=` editado na mão.
 *
 * E se a barra aparecesse com a conta antiga, diria "25–9 de 9" — porque o
 * `de` vem da página pedida e o `até` do total, e fora da faixa os dois
 * cruzam.
 */

describe('o que a barra mostra', () => {
  it('não aparece quando tudo cabe numa página', () => {
    expect(estadoDaPaginacao(1, 24, 9)).toEqual({ tipo: 'oculta' })
    expect(estadoDaPaginacao(1, 24, 24)).toEqual({ tipo: 'oculta' })
    expect(estadoDaPaginacao(1, 24, 0)).toEqual({ tipo: 'oculta' })
  })

  it('mostra a faixa da página e o total', () => {
    expect(estadoDaPaginacao(1, 20, 478)).toEqual({
      tipo: 'visivel',
      de: 1,
      ate: 20,
      totalPaginas: 24,
    })
    expect(estadoDaPaginacao(2, 20, 478)).toMatchObject({ de: 21, ate: 40 })
  })

  it('a última página não passa do total', () => {
    // 478 = 23 páginas cheias e uma de 18. Dizer "461–480 de 478" é inventar
    // dois itens que não existem.
    expect(estadoDaPaginacao(24, 20, 478)).toMatchObject({ de: 461, ate: 478, totalPaginas: 24 })
  })

  it('avisa quando a página pedida não existe mais', () => {
    /*
     * O defeito. Com `oculta` aqui, a tela some com a barra e a pessoa fica
     * numa seção vazia sem saída.
     */
    expect(estadoDaPaginacao(2, 24, 9)).toEqual({ tipo: 'fora_da_faixa', ultimaPagina: 1 })
    expect(estadoDaPaginacao(99, 20, 478)).toEqual({ tipo: 'fora_da_faixa', ultimaPagina: 24 })
  })

  it('e nunca devolve uma faixa invertida', () => {
    /*
     * A asserção que impede o conserto de virar "mostra a barra sempre": fora
     * da faixa, `de` passa o `até` e o rótulo sairia "25–9 de 9".
     */
    for (const [pagina, tamanho, total] of [
      [2, 24, 9],
      [5, 10, 12],
      [100, 20, 1],
    ] as const) {
      const estado = estadoDaPaginacao(pagina, tamanho, total)
      expect(estado.tipo).toBe('fora_da_faixa')
      if (estado.tipo === 'visivel') expect(estado.de).toBeLessThanOrEqual(estado.ate)
    }
  })

  it('aguenta valor estranho sem dividir por zero', () => {
    // `?page=-3` e `pageSize` zerado por um chamador novo não podem virar
    // `Infinity` nem `NaN` na tela.
    expect(estadoDaPaginacao(-3, 20, 100)).toMatchObject({ tipo: 'visivel', de: 1, ate: 20 })
    expect(estadoDaPaginacao(1, 0, 100)).toMatchObject({ tipo: 'visivel', totalPaginas: 100 })
    expect(estadoDaPaginacao(1, 20, -5)).toEqual({ tipo: 'oculta' })
  })
})
