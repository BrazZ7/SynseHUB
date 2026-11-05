import { describe, expect, it } from 'vitest'

import {
  EXPERIENCIAS,
  OBJETIVOS,
  precisaDaEntradaGuiada,
  respondeu,
  rotuloDaExperiencia,
  rotuloDoObjetivo,
} from '@/features/students/entrada/state'
import { studentIntakeSchema } from '@/lib/validations/workout'
import type { StudentIntake } from '@/types/domain'

/**
 * A porta da entrada guiada.
 *
 * Esta é a regra que decide se **toda** abertura do app desvia para o
 * questionário. Um engano aqui tem duas formas, e as duas são ruins:
 *
 *  - desviar sempre prende a pessoa fora da tela de hoje, a cada abertura;
 *  - não desviar nunca faz a funcionalidade não existir, em silêncio.
 *
 * Por isso ela é uma função pura fora da página — renderizar a página em teste
 * é algo que este projeto não faz, e testar isto é direto.
 */

const intake = (patch: Partial<StudentIntake> = {}): StudentIntake => ({
  studentId: 'stu_1',
  goal: null,
  experience: null,
  daysPerWeek: null,
  completedAt: null,
  skippedAt: null,
  ...patch,
})

describe('a porta da entrada guiada', () => {
  it('nunca abriu a tela: manda', () => {
    expect(precisaDaEntradaGuiada(null)).toBe(true)
  })

  it('já perguntei e a pessoa disse depois: não manda', () => {
    /*
     * A razão de `skipped_at` existir. Sem ele, "pular" seria indistinguível
     * de "nunca respondeu" e a tela voltaria a cada abertura — que é como uma
     * boa-vinda vira obstáculo.
     */
    expect(precisaDaEntradaGuiada(intake({ skippedAt: '2026-10-23T10:00:00Z' }))).toBe(false)
  })

  it('respondeu: não manda', () => {
    expect(
      precisaDaEntradaGuiada(
        intake({
          goal: 'EMAGRECER',
          experience: 'VOLTANDO',
          daysPerWeek: 3,
          completedAt: '2026-10-23T10:00:00Z',
        }),
      ),
    ).toBe(false)
  })

  it('respondeu depois de ter pulado: não manda', () => {
    expect(
      precisaDaEntradaGuiada(
        intake({ completedAt: '2026-10-23T11:00:00Z', skippedAt: null, daysPerWeek: 3 }),
      ),
    ).toBe(false)
  })

  it('linha existe mas sem resposta nem recusa: manda', () => {
    /*
     * Não deveria acontecer — as duas funções do banco sempre preenchem um
     * dos dois —, e é justamente por isso que o caso precisa de resposta
     * definida: uma linha órfã não pode significar "já perguntei".
     */
    expect(precisaDaEntradaGuiada(intake())).toBe(true)
  })
})

describe('respondeu', () => {
  it('só com `completedAt`', () => {
    expect(respondeu(null)).toBe(false)
    expect(respondeu(intake({ skippedAt: '2026-10-23T10:00:00Z' }))).toBe(false)
    expect(respondeu(intake({ completedAt: '2026-10-23T10:00:00Z' }))).toBe(true)
  })
})

describe('os rótulos', () => {
  it('a lista da tela é exatamente a do enum — nem a mais, nem a menos', () => {
    /*
     * Iterar a lista e conferir que cada item tem rótulo **não** pega a falta:
     * uma opção removida vira uma volta a menos no laço e o teste passa. Foi
     * um mutante sobrevivente, e a correção veio em dois níveis — `Record`
     * sobre a união em `state.ts`, que não compila sem o valor novo, e esta
     * comparação de conjuntos, que pega o valor **removido** da tela enquanto
     * o banco ainda o aceita na linha de quem já escolheu.
     */
    expect([...OBJETIVOS.map((o) => o.valor)].sort()).toEqual(
      [...studentIntakeSchema.shape.goal.options].sort(),
    )
    expect([...EXPERIENCIAS.map((e) => e.valor)].sort()).toEqual(
      [...studentIntakeSchema.shape.experience.options].sort(),
    )
  })

  it('todo valor da lista tem rótulo', () => {
    for (const opcao of OBJETIVOS) expect(rotuloDoObjetivo(opcao.valor)).toBeTruthy()
    for (const opcao of EXPERIENCIAS) expect(rotuloDaExperiencia(opcao.valor)).toBeTruthy()
  })

  it('os valores são exatamente os que o schema aceita', () => {
    // Se divergirem, a tela oferece uma opção que a validação recusa.
    for (const opcao of OBJETIVOS) {
      const r = studentIntakeSchema.safeParse({
        goal: opcao.valor,
        experience: 'VOLTANDO',
        daysPerWeek: 3,
      })
      expect(r.success, opcao.valor).toBe(true)
    }
    for (const opcao of EXPERIENCIAS) {
      const r = studentIntakeSchema.safeParse({
        goal: 'SAUDE',
        experience: opcao.valor,
        daysPerWeek: 3,
      })
      expect(r.success, opcao.valor).toBe(true)
    }
  })

  it('valor fora da lista não tem rótulo inventado', () => {
    expect(rotuloDoObjetivo(null)).toBeNull()
    expect(rotuloDaExperiencia(null)).toBeNull()
  })
})

describe('a validação da entrada', () => {
  const base = { goal: 'EMAGRECER', experience: 'NUNCA_TREINEI', daysPerWeek: 3 }

  it('aceita a faixa inteira de dias', () => {
    for (const daysPerWeek of [1, 4, 7]) {
      expect(studentIntakeSchema.safeParse({ ...base, daysPerWeek }).success).toBe(true)
    }
  })

  it('recusa fora da faixa', () => {
    for (const daysPerWeek of [0, 8, -2]) {
      const r = studentIntakeSchema.safeParse({ ...base, daysPerWeek })
      expect(r.success).toBe(false)
      if (!r.success) expect(r.error.issues[0]?.message).toMatch(/1 a 7/)
    }
  })

  it('recusa dia quebrado', () => {
    // A coluna é `smallint`: 3.5 chegaria truncado e diria outra coisa.
    expect(studentIntakeSchema.safeParse({ ...base, daysPerWeek: 3.5 }).success).toBe(false)
  })

  it('recusa objetivo inventado, com mensagem em português', () => {
    const r = studentIntakeSchema.safeParse({ ...base, goal: 'VIRAR_ATLETA' })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0]?.message).toBe('Escolha um objetivo.')
  })

  it('recusa resposta pela metade', () => {
    expect(studentIntakeSchema.safeParse({ goal: 'SAUDE', daysPerWeek: 3 }).success).toBe(false)
    expect(studentIntakeSchema.safeParse({ goal: 'SAUDE', experience: 'VOLTANDO' }).success).toBe(
      false,
    )
  })
})
