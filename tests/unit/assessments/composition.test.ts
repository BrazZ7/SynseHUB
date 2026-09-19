import { describe, expect, it } from 'vitest'

import {
  densidadeCorporal,
  foraDaFaixaValidada,
  idadeEm,
  imc,
  percentualDeGordura,
  pontosExigidos,
  somaDasDobras,
} from '@/features/assessments/composition'

/**
 * A prévia da tela contra os mesmos valores conhecidos de `tests/db/assessments.test.ts`.
 *
 * As fórmulas existem duas vezes de propósito: o banco é quem grava, e a cópia
 * em TypeScript é para o percentual aparecer enquanto o avaliador digita. O
 * risco dessa duplicação é divergirem em silêncio — corrigir um coeficiente de
 * um lado e esquecer o outro faria a tela prometer 18% e a ficha guardar 21%.
 * Se um destes números mudar aqui sem mudar lá (ou o contrário), um dos dois
 * conjuntos falha.
 */

const gordura = (
  ...args: Parameters<typeof densidadeCorporal>
) => percentualDeGordura(densidadeCorporal(...args))

describe('IMC', () => {
  it('sai do peso e da altura em centímetros', () => {
    expect(imc(80, 180)).toBeCloseTo(24.69, 2)
    expect(imc(90, 180)).toBeCloseTo(27.78, 2)
  })

  it('sem altura não há número', () => {
    expect(imc(80, null)).toBeNull()
    expect(imc(80, 0)).toBeNull()
  })
})

describe('soma das dobras', () => {
  const sete = {
    chest: 12,
    axilla: 12,
    triceps: 12,
    subscapular: 16,
    abdominal: 20,
    suprailiac: 16,
    thigh: 12,
  }

  it('Pollock 3 masculino soma peitoral, abdômen e coxa', () => {
    expect(somaDasDobras('POLLOCK_3', 'MALE', sete)).toBe(12 + 20 + 12)
  })

  it('Pollock 3 feminino soma tríceps, supra-ilíaca e coxa', () => {
    expect(somaDasDobras('POLLOCK_3', 'FEMALE', sete)).toBe(12 + 16 + 12)
  })

  it('Pollock 7 soma as sete', () => {
    expect(somaDasDobras('POLLOCK_7', 'MALE', sete)).toBe(100)
  })

  it('manual não soma nada', () => {
    expect(somaDasDobras('MANUAL', 'MALE', sete)).toBeNull()
  })

  it('sem sexo declarado o Pollock 3 não escolhe conjunto', () => {
    expect(somaDasDobras('POLLOCK_3', null, sete)).toBeNull()
  })
})

describe('pontos que o formulário pede', () => {
  it('três para o Pollock 3, e não os mesmos três', () => {
    expect(pontosExigidos('POLLOCK_3', 'MALE')).toEqual(['chest', 'abdominal', 'thigh'])
    expect(pontosExigidos('POLLOCK_3', 'FEMALE')).toEqual(['triceps', 'suprailiac', 'thigh'])
  })

  it('sete para o Pollock 7, independente do sexo', () => {
    expect(pontosExigidos('POLLOCK_7', 'MALE')).toHaveLength(7)
    expect(pontosExigidos('POLLOCK_7', 'FEMALE')).toHaveLength(7)
  })

  it('nenhum no manual — não há dobra a pedir', () => {
    expect(pontosExigidos('MANUAL', 'MALE')).toEqual([])
  })
})

describe('densidade e percentual, contra os valores do banco', () => {
  it('Pollock 3 masculino: soma 45 mm, 30 anos', () => {
    expect(densidadeCorporal('POLLOCK_3', 'MALE', 30, 45)).toBeCloseTo(1.0677, 4)
    expect(gordura('POLLOCK_3', 'MALE', 30, 45)).toBeCloseTo(13.61, 2)
  })

  it('Pollock 3 feminino: soma 60 mm, 30 anos', () => {
    expect(densidadeCorporal('POLLOCK_3', 'FEMALE', 30, 60)).toBeCloseTo(1.04402, 4)
    expect(gordura('POLLOCK_3', 'FEMALE', 30, 60)).toBeCloseTo(24.13, 2)
  })

  it('Pollock 7 masculino: soma 100 mm, 30 anos', () => {
    // O coeficiente de idade é 0,00028826. Há fonte publicada com 0,00012882 —
    // dígitos embaralhados da equação feminina —, e a diferença passa de um
    // ponto percentual num homem de 40 anos.
    expect(densidadeCorporal('POLLOCK_7', 'MALE', 30, 100)).toBeCloseTo(1.06535, 4)
    expect(gordura('POLLOCK_7', 'MALE', 30, 100)).toBeCloseTo(14.64, 2)
  })

  it('Pollock 7 feminino: soma 120 mm, 30 anos', () => {
    expect(densidadeCorporal('POLLOCK_7', 'FEMALE', 30, 120)).toBeCloseTo(1.04485, 4)
    expect(gordura('POLLOCK_7', 'FEMALE', 30, 120)).toBeCloseTo(23.75, 2)
  })

  it('idade pesa: o mesmo corpo, mais velho, estima mais gordura', () => {
    expect(gordura('POLLOCK_3', 'MALE', 55, 45)!).toBeGreaterThan(
      gordura('POLLOCK_3', 'MALE', 20, 45)!,
    )
  })

  it('sem sexo, sem idade ou no manual não há densidade', () => {
    expect(densidadeCorporal('POLLOCK_3', null, 30, 45)).toBeNull()
    expect(densidadeCorporal('POLLOCK_3', 'MALE', null, 45)).toBeNull()
    expect(densidadeCorporal('MANUAL', 'MALE', 30, 45)).toBeNull()
  })

  it('dobras absurdas não viram gordura negativa', () => {
    expect(gordura('POLLOCK_3', 'MALE', 18, 3)!).toBeGreaterThanOrEqual(0)
  })
})

describe('faixa em que as equações foram validadas', () => {
  it('18 a 61 para homens, 18 a 55 para mulheres', () => {
    expect(foraDaFaixaValidada('MALE', 30)).toBe(false)
    expect(foraDaFaixaValidada('MALE', 62)).toBe(true)
    expect(foraDaFaixaValidada('FEMALE', 56)).toBe(true)
    expect(foraDaFaixaValidada('FEMALE', 55)).toBe(false)
    expect(foraDaFaixaValidada('MALE', 17)).toBe(true)
  })

  it('sem idade ou sem sexo não avisa nada — não há o que comparar', () => {
    expect(foraDaFaixaValidada(null, 70)).toBe(false)
    expect(foraDaFaixaValidada('MALE', null)).toBe(false)
  })
})

describe('idade no dia da avaliação', () => {
  it('desconta o ano quando o aniversário ainda não chegou', () => {
    expect(idadeEm('1990-12-31', '2020-06-15')).toBe(29)
    expect(idadeEm('1990-01-01', '2020-06-15')).toBe(30)
    // No próprio dia do aniversário a idade já virou.
    expect(idadeEm('1990-06-15', '2020-06-15')).toBe(30)
  })

  it('sem data de nascimento não chuta', () => {
    expect(idadeEm(null, '2020-06-15')).toBeNull()
    expect(idadeEm('não é data', '2020-06-15')).toBeNull()
  })
})
