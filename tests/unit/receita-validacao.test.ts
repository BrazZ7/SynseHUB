import { describe, expect, it } from 'vitest'

import {
  CATEGORIAS,
  CATEGORIAS_LISTA,
  ordemDaCategoria,
  etiquetasDoTexto,
  ingredientesDoTexto,
  macrosDoFormulario,
  saveRecipeSchema,
} from '@/lib/validations/recipe'

describe('ingredientesDoTexto', () => {
  it('quebra por linha e descarta o vazio', () => {
    expect(ingredientesDoTexto('3 ovos\n\n  1 banana  \n\n')).toEqual(['3 ovos', '1 banana'])
  })

  it('texto vazio vira lista vazia, não lista com um vazio', () => {
    expect(ingredientesDoTexto('')).toEqual([])
    expect(ingredientesDoTexto('   \n  ')).toEqual([])
  })
})

describe('etiquetasDoTexto', () => {
  it('separa por vírgula, normaliza e não repete', () => {
    expect(etiquetasDoTexto('Marmita, proteico , MARMITA,, vegano')).toEqual([
      'marmita',
      'proteico',
      'vegano',
    ])
  })

  it('texto vazio vira lista vazia', () => {
    expect(etiquetasDoTexto('')).toEqual([])
    expect(etiquetasDoTexto(' , , ')).toEqual([])
  })
})

describe('macrosDoFormulario', () => {
  it('monta só o que foi preenchido', () => {
    expect(macrosDoFormulario({ kcal: 420, protein: 38, carbs: '', fat: '' })).toEqual({
      kcal: 420,
      protein: 38,
    })
  })

  it('nenhum preenchido devolve nulo, e não objeto vazio', () => {
    /*
     * A tela decide mostrar a tabela de macros pela existência do objeto. Um
     * `{}` faria aparecer um quadro sem nada dentro.
     */
    expect(macrosDoFormulario({ kcal: '', protein: '', carbs: '', fat: '' })).toBeNull()
  })

  it('e zero é valor, não ausência', () => {
    expect(macrosDoFormulario({ kcal: 0, protein: '', carbs: '', fat: '' })).toEqual({ kcal: 0 })
  })
})

describe('saveRecipeSchema', () => {
  const base = { title: 'Ovos mexidos', category: 'CAFE' }

  it('aceita o mínimo', () => {
    const r = saveRecipeSchema.safeParse(base)
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.visibility).toBe('SYNSE_PLUS')
  })

  it('recusa categoria que não está na lista', () => {
    expect(saveRecipeSchema.safeParse({ ...base, category: 'CEIA' }).success).toBe(false)
  })

  it('recusa preparo fora da faixa, antes de a pessoa perder o texto', () => {
    // A mesma faixa está na 0044. Repetida aqui de propósito: o banco recusa
    // com exceção, e a tela precisa dizer isso no campo.
    expect(saveRecipeSchema.safeParse({ ...base, prepMinutes: 9999 }).success).toBe(false)
    expect(saveRecipeSchema.safeParse({ ...base, prepMinutes: 0 }).success).toBe(false)
    expect(saveRecipeSchema.safeParse({ ...base, prepMinutes: 30 }).success).toBe(true)
  })

  it('e campo numérico vazio continua válido — é opcional', () => {
    const r = saveRecipeSchema.safeParse({ ...base, prepMinutes: '', servings: '', kcal: '' })
    expect(r.success).toBe(true)
  })

  it('recusa endereço de imagem que não é endereço', () => {
    expect(saveRecipeSchema.safeParse({ ...base, imageUrl: 'foto.jpg' }).success).toBe(false)
    expect(saveRecipeSchema.safeParse({ ...base, imageUrl: '' }).success).toBe(true)
  })

  it('o id é identificador, não UUID', () => {
    // A lição de `validations/program.ts` e do acervo: em demonstração os ids
    // são legíveis (`rec_frango`), e um `uuid()` quebraria a edição inteira.
    expect(saveRecipeSchema.safeParse({ ...base, id: 'rec_frango' }).success).toBe(true)
  })
})

describe('as categorias', () => {
  it('toda chave da lista tem rótulo', () => {
    for (const chave of CATEGORIAS_LISTA) {
      expect(CATEGORIAS[chave]).toBeTruthy()
    }
    expect(CATEGORIAS_LISTA.length).toBe(Object.keys(CATEGORIAS).length)
  })

  it('seguem a ordem do dia, e não a do alfabeto', () => {
    /*
     * O defeito que isto prende: o banco ordena por `category`, que é o
     * **código**, e `ALMOCO` vem antes de `CAFE` no alfabeto — a tela abria
     * com o almoço acima do café da manhã. Encontrado olhando a tela.
     */
    expect(ordemDaCategoria('CAFE')).toBeLessThan(ordemDaCategoria('ALMOCO'))
    expect(ordemDaCategoria('ALMOCO')).toBeLessThan(ordemDaCategoria('JANTAR'))
    expect(ordemDaCategoria('PRE_TREINO')).toBeLessThan(ordemDaCategoria('POS_TREINO'))

    // E a prova de que a ordem não é por acaso a alfabética.
    const alfabetica = [...CATEGORIAS_LISTA].sort()
    expect(CATEGORIAS_LISTA).not.toEqual(alfabetica)
  })

  it('categoria desconhecida vai para o fim, não para o começo', () => {
    // O banco aceita texto livre de propósito. Um `indexOf` cru devolveria
    // -1 e jogaria o desconhecido acima do café da manhã.
    expect(ordemDaCategoria('CEIA')).toBeGreaterThan(ordemDaCategoria('BEBIDA'))
  })
})
