import { describe, expect, it } from 'vitest'

import { gruposTrabalhados, legendaDosGrupos } from '@/features/workouts/grupos-do-treino'
import type { Exercise, MuscleGroup, WorkoutExercise } from '@/types/domain'

/**
 * ── O nome que o treino ganha na tela ───────────────────────────────────────
 *
 * A capa de cada treino acende as regiões do mapa muscular e escreve a legenda
 * — "Peito · Braços" — a partir desta função. A ordem **é** o nome: quem
 * aparece primeiro é o que a pessoa lê como sendo o treino de hoje.
 */

const ex = (muscleGroup: MuscleGroup, i: number) =>
  ({
    id: `we-${i}`,
    workoutPlanId: 'p1',
    exerciseId: `e-${i}`,
    order: i,
    sets: 3,
    reps: '10',
    restSeconds: 60,
    suggestedLoad: null,
    notes: null,
    exercise: { id: `e-${i}`, name: `Exercício ${i}`, muscleGroup },
  }) as WorkoutExercise & { exercise: Exercise }

describe('a ordem dos grupos', () => {
  it('é por peso, e não pela ordem da ficha', () => {
    /*
     * A asserção central. A ficha começa com um abdominal de aquecimento e
     * tem quatro de perna depois: pela ordem da ficha isto seria um "treino
     * de core", que é o nome errado para o que a pessoa vai fazer.
     */
    const ficha = [ex('CORE', 1), ex('LEGS', 2), ex('LEGS', 3), ex('LEGS', 4), ex('LEGS', 5)]

    expect(gruposTrabalhados(ficha)).toEqual(['LEGS', 'CORE'])
  })

  it('empate sai na ordem em que apareceu', () => {
    /*
     * `Map` preserva a ordem de inserção e `sort` é estável desde o ES2019:
     * dois grupos com o mesmo peso saem na ordem da ficha, que é previsível.
     * Sem isso a legenda mudaria de "Peito · Costas" para "Costas · Peito"
     * entre dois carregamentos do mesmo treino.
     */
    const ficha = [ex('CHEST', 1), ex('BACK', 2), ex('CHEST', 3), ex('BACK', 4)]

    expect(gruposTrabalhados(ficha)).toEqual(['CHEST', 'BACK'])
  })

  it('ficha vazia não quebra', () => {
    expect(gruposTrabalhados([])).toEqual([])
  })

  it('não repete grupo', () => {
    const ficha = [ex('ARMS', 1), ex('ARMS', 2), ex('ARMS', 3)]

    expect(gruposTrabalhados(ficha)).toEqual(['ARMS'])
  })
})

describe('a legenda da capa', () => {
  it('mostra no máximo três', () => {
    // Num telefone, a quarta já corta no meio da palavra.
    const todos: MuscleGroup[] = ['LEGS', 'GLUTES', 'CORE', 'BACK', 'CHEST']

    expect(legendaDosGrupos(todos)).toEqual(['LEGS', 'GLUTES', 'CORE'])
  })

  it('corpo inteiro come os outros', () => {
    /*
     * "Corpo inteiro · Peito · Pernas" diz duas vezes a mesma coisa. E a
     * posição não importa: num treino funcional o `FULL_BODY` pode não ser o
     * mais pesado e ainda assim é ele que descreve o treino.
     */
    expect(legendaDosGrupos(['CHEST', 'FULL_BODY', 'LEGS'])).toEqual(['FULL_BODY'])
  })

  it('lista vazia não vira legenda', () => {
    expect(legendaDosGrupos([])).toEqual([])
  })
})
