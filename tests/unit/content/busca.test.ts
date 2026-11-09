import { describe, expect, it } from 'vitest'

import { casaTermo, normalizar } from '@/features/content/busca'

/**
 * A regra de casamento da busca, do lado da demonstração (0067).
 *
 * Em produção quem busca é o banco. Este arquivo cobre a cópia que existe para
 * a demonstração funcionar sem banco; a equivalência entre as duas é
 * verificada em `tests/db/favoritos-e-busca.test.ts`, par a par.
 */

describe('normalizar', () => {
  it('tira acento e caixa', () => {
    expect(normalizar('Açaí')).toBe('acai')
    expect(normalizar('PERIODIZAÇÃO')).toBe('periodizacao')
    expect(normalizar('  Treino  ')).toBe('treino')
  })

  it('não mexe no que já está normalizado', () => {
    expect(normalizar('granola')).toBe('granola')
  })

  it('ç, til, circunflexo e crase', () => {
    // Os quatro que o português usa, porque errar um deles só aparece na
    // palavra que ninguém testou.
    expect(normalizar('coração')).toBe('coracao')
    expect(normalizar('pão')).toBe('pao')
    expect(normalizar('você')).toBe('voce')
    expect(normalizar('à toa')).toBe('a toa')
  })
})

describe('casaTermo', () => {
  const texto = 'Treino em casa sem equipamento'

  it('termo vazio casa com tudo', () => {
    // A tela tem um caminho só, com ou sem busca — como em `search_exercises`.
    expect(casaTermo(texto, '')).toBe(true)
    expect(casaTermo(texto, '   ')).toBe(true)
  })

  it('cada palavra casa em separado, em qualquer ordem', () => {
    expect(casaTermo(texto, 'treino casa')).toBe(true)
    expect(casaTermo(texto, 'casa treino')).toBe(true)
  })

  it('uma palavra que não casa derruba o conjunto', () => {
    /*
     * "todas" e não "qualquer": com "qualquer", procurar "treino piscina"
     * devolveria todo treino do acervo, e a busca pareceria ignorar a segunda
     * palavra.
     */
    expect(casaTermo(texto, 'treino piscina')).toBe(false)
  })

  it('acento não conta nos dois lados', () => {
    expect(casaTermo('Açaí na tigela', 'acai')).toBe(true)
    expect(casaTermo('Acai na tigela', 'açaí')).toBe(true)
  })

  it('casa no meio da palavra', () => {
    // "perio" acha "periodização": quem digita devagar vê o resultado chegando.
    expect(casaTermo('Periodização avançada', 'perio')).toBe(true)
  })

  it('espaço a mais não muda nada', () => {
    expect(casaTermo(texto, '  treino   casa  ')).toBe(true)
  })

  it('texto vazio só casa com termo vazio', () => {
    expect(casaTermo('', '')).toBe(true)
    expect(casaTermo('', 'treino')).toBe(false)
  })
})
