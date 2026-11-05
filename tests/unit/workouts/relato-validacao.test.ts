import { describe, expect, it } from 'vitest'

import { workoutFeedbackSchema } from '@/lib/validations/workout'

/**
 * A validação do relato do treino (0062).
 *
 * Ela não é a que segura: `set_workout_feedback` confere o dono pelo
 * `auth.uid()` e a escala pelo `check` da coluna, e é essa a camada que não dá
 * para contornar. O que este schema faz é dar mensagem em português antes de
 * gastar uma viagem — e normalizar a observação, que é onde as duas pontas
 * precisam concordar.
 */

const base = { effort: 7, discomfort: false, note: null }

describe('o relato do treino', () => {
  it('aceita a escala inteira', () => {
    for (const effort of [1, 5, 10]) {
      expect(workoutFeedbackSchema.safeParse({ ...base, effort }).success).toBe(true)
    }
  })

  it('recusa fora da escala, com a mesma mensagem', () => {
    for (const effort of [0, 11, -3]) {
      const r = workoutFeedbackSchema.safeParse({ ...base, effort })
      expect(r.success).toBe(false)
      if (!r.success) expect(r.error.issues[0]?.message).toBe('O esforço vai de 1 a 10.')
    }
  })

  it('recusa esforço quebrado', () => {
    // A coluna é `smallint`: 7.5 chegaria truncado e o relato diria outra coisa.
    expect(workoutFeedbackSchema.safeParse({ ...base, effort: 7.5 }).success).toBe(false)
  })

  it('observação só de espaço vira nulo, como no banco', () => {
    /*
     * `nullif(btrim(...))` faz o mesmo lá dentro. As duas pontas concordando é
     * o que mantém a coluna sem strings de espaço em branco vindas de
     * qualquer caminho — e o que faz a tela do professor não mostrar um
     * balãozinho vazio.
     */
    const r = workoutFeedbackSchema.safeParse({ ...base, note: '   \n  ' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.note).toBeNull()
  })

  it('tira o espaço das pontas e guarda o resto', () => {
    const r = workoutFeedbackSchema.safeParse({ ...base, note: '  ombro direito  ' })
    expect(r.success && r.data.note).toBe('ombro direito')
  })

  it('o teto é o mesmo da coluna', () => {
    expect(workoutFeedbackSchema.safeParse({ ...base, note: 'a'.repeat(500) }).success).toBe(true)
    const r = workoutFeedbackSchema.safeParse({ ...base, note: 'a'.repeat(501) })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0]?.message).toMatch(/500 caracteres/)
  })

  it('exige a marcação de desconforto explícita', () => {
    /*
     * Sem `default(false)` de propósito: a action monta o objeto a partir do
     * que a tela mandou, e um `discomfort` ausente virando `false` em silêncio
     * esconderia um defeito de ligação em que a marcação da pessoa se perde no
     * caminho.
     */
    expect(workoutFeedbackSchema.safeParse({ effort: 7, note: null }).success).toBe(false)
  })
})
