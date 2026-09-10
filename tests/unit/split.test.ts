import { describe, expect, it } from 'vitest'

import { calculateSplit } from '@/lib/payments/split'

/**
 * O split decide quanto a academia recebe. Erro aqui é dinheiro errado na
 * conta de outra pessoa, então os casos cobrem a soma exata, os arredondamentos
 * e as três estratégias de tarifa.
 */

const base = {
  platformFeePercentage: 2,
  platformFixedFee: 0,
  paymentProviderFeeStrategy: 'ORGANIZATION_ABSORBS' as const,
}

describe('calculateSplit', () => {
  it('aplica o percentual configurado, sem constante no código', () => {
    const dois = calculateSplit(100, base)
    const cinco = calculateSplit(100, { ...base, platformFeePercentage: 5 })

    expect(dois.platformAmount).toBe(2)
    expect(cinco.platformAmount).toBe(5)
    expect(cinco.platformPercentage).toBe(5)
  })

  it('nunca perde nem inventa centavo', () => {
    // 109,90 a 2% dá 2,198 — o arredondamento não pode desequilibrar a soma.
    const result = calculateSplit(109.9, base)
    expect(result.platformAmount + result.organizationAmount).toBeCloseTo(109.9, 2)
  })

  it('soma bate em uma faixa larga de valores e percentuais', () => {
    for (let amount = 1; amount <= 500; amount += 7) {
      for (const percentage of [0, 1.5, 2, 3.75, 10]) {
        const result = calculateSplit(amount, { ...base, platformFeePercentage: percentage })
        expect(result.platformAmount + result.organizationAmount).toBeCloseTo(amount, 2)
      }
    }
  })

  it('soma a taxa fixa ao percentual', () => {
    const result = calculateSplit(100, { ...base, platformFixedFee: 1.5 })
    expect(result.platformAmount).toBe(3.5)
    expect(result.organizationAmount).toBe(96.5)
  })

  describe('quem absorve a tarifa do provedor', () => {
    it('ORGANIZATION_ABSORBS desconta da academia', () => {
      const result = calculateSplit(100, base, 3)
      expect(result.platformAmount).toBe(2)
      expect(result.organizationAmount).toBe(95)
    })

    it('PLATFORM_ABSORBS desconta da Synse', () => {
      const result = calculateSplit(100, { ...base, paymentProviderFeeStrategy: 'PLATFORM_ABSORBS' }, 3)
      expect(result.platformAmount).toBe(-1)
      expect(result.organizationAmount).toBe(98)
    })

    it('CUSTOMER_ABSORBS não desconta de ninguém: já veio no valor cobrado', () => {
      const result = calculateSplit(103, { ...base, paymentProviderFeeStrategy: 'CUSTOMER_ABSORBS' }, 3)
      expect(result.organizationAmount).toBe(100.94)
      expect(result.platformAmount).toBe(2.06)
    })
  })

  it('a academia nunca recebe valor negativo', () => {
    // Tarifa maior que a cobrança: cenário absurdo, mas a trava precisa existir.
    const result = calculateSplit(5, { ...base, platformFeePercentage: 50 }, 10)
    expect(result.organizationAmount).toBe(0)
    expect(result.platformAmount).toBeGreaterThanOrEqual(0)
  })

  it('cobrança de valor zero não quebra', () => {
    const result = calculateSplit(0, base)
    expect(result.platformAmount).toBe(0)
    expect(result.organizationAmount).toBe(0)
  })
})
