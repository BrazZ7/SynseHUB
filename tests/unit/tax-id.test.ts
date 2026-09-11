import { describe, expect, it } from 'vitest'

import { formatCpf, isValidCpf, normalizeTaxId } from '@/lib/validations/tax-id'

/**
 * CPF inválido só é recusado lá na frente, pelo provedor, com a mensalidade já
 * cadastrada e o aluno esperando o PIX. Estes testes existem para a recusa
 * acontecer no cadastro.
 */

describe('isValidCpf', () => {
  it('aceita CPF válido, com e sem máscara', () => {
    expect(isValidCpf('24971563792')).toBe(true)
    expect(isValidCpf('249.715.637-92')).toBe(true)
  })

  it('recusa dígito verificador errado', () => {
    expect(isValidCpf('24971563791')).toBe(false)
  })

  /*
   * Os onze repetidos passam na aritmética do módulo 11 — é por isso que
   * precisam de recusa explícita. Também é o que mais aparece em cadastro de
   * teste que acaba virando cadastro real.
   */
  it('recusa os repetidos, que passariam na conta', () => {
    for (const digito of '0123456789') {
      expect(isValidCpf(digito.repeat(11))).toBe(false)
    }
  })

  it('recusa tamanho errado e texto', () => {
    expect(isValidCpf('123')).toBe(false)
    expect(isValidCpf('')).toBe(false)
    expect(isValidCpf('abcdefghijk')).toBe(false)
    expect(isValidCpf('249715637921')).toBe(false)
  })
})

describe('normalizeTaxId', () => {
  it('guarda só os dígitos — a máscara é da tela, não do banco', () => {
    expect(normalizeTaxId('249.715.637-92')).toBe('24971563792')
  })
})

describe('formatCpf', () => {
  it('formata para leitura', () => {
    expect(formatCpf('24971563792')).toBe('249.715.637-92')
  })

  it('devolve o que recebeu quando não dá para formatar', () => {
    expect(formatCpf('123')).toBe('123')
    expect(formatCpf(null)).toBe('')
  })
})
