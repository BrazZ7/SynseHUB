import { describe, expect, it } from 'vitest'

import { bearerAutorizado, timingSafeEqual } from '@/lib/secrets'

describe('comparação de segredo', () => {
  it('igual é igual, diferente é diferente', () => {
    expect(timingSafeEqual('abc123', 'abc123')).toBe(true)
    expect(timingSafeEqual('abc123', 'abc124')).toBe(false)
  })

  it('tamanhos diferentes não são iguais', () => {
    expect(timingSafeEqual('abc', 'abcd')).toBe(false)
    expect(timingSafeEqual('', 'a')).toBe(false)
  })

  it('difere no começo ou no fim, o resultado é o mesmo', () => {
    /*
     * O tempo em si não dá para afirmar num teste — depende da máquina e do
     * JIT. O que dá para fixar é o comportamento de onde a diferença está: se
     * um dia alguém trocar por um `===` ou por um laço com saída antecipada,
     * estes casos continuam passando, mas o teste ao lado documenta a razão
     * de a função existir separada.
     */
    expect(timingSafeEqual('xbc123', 'abc123')).toBe(false)
    expect(timingSafeEqual('abc12x', 'abc123')).toBe(false)
  })
})

describe('autorização por portador', () => {
  const segredo = 'segredo-longo-de-verdade-123'

  it('aceita com e sem o prefixo Bearer', () => {
    expect(bearerAutorizado(`Bearer ${segredo}`, segredo)).toBe(true)
    expect(bearerAutorizado(segredo, segredo)).toBe(true)
    expect(bearerAutorizado(`bearer ${segredo}`, segredo)).toBe(true)
  })

  it('recusa quando o segredo não está configurado', () => {
    /*
     * A regra que mais importa: um esquecimento de variável de ambiente não
     * pode virar endereço aberto. Sem segredo, ninguém passa — nem quem manda
     * cabeçalho vazio, nem quem manda qualquer coisa.
     */
    expect(bearerAutorizado('Bearer qualquer', '')).toBe(false)
    expect(bearerAutorizado('', '')).toBe(false)
    expect(bearerAutorizado(null, '')).toBe(false)
  })

  it('recusa cabeçalho ausente, vazio ou errado', () => {
    expect(bearerAutorizado(null, segredo)).toBe(false)
    expect(bearerAutorizado('', segredo)).toBe(false)
    expect(bearerAutorizado('Bearer ', segredo)).toBe(false)
    expect(bearerAutorizado('Bearer outro-valor-qualquer!!', segredo)).toBe(false)
  })
})
