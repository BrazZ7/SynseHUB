import { describe, expect, it } from 'vitest'

import { exerciseOptionLabel, groupExercisesForSelect } from '@/features/workouts/group-exercises'
import type { Exercise } from '@/types/domain'

function exercicio(over: Partial<Exercise> & { id: string; name: string }): Exercise {
  return {
    organizationId: null,
    muscleGroup: 'CHEST',
    equipment: null,
    description: null,
    videoUrl: null,
    imageUrl: null,
    slug: over.id,
    primaryMuscle: null,
    secondaryMuscles: [],
    region: null,
    pattern: null,
    mechanics: null,
    utility: null,
    equipmentType: null,
    unilateral: false,
    level: null,
    aliases: [],
    ...over,
  }
}

describe('agrupamento da biblioteca', () => {
  it('agrupa por região e músculo, na ordem do corpo', () => {
    const grupos = groupExercisesForSelect([
      exercicio({ id: 'a', name: 'Agachamento', region: 'LOWER_BODY', primaryMuscle: 'QUADS' }),
      exercicio({ id: 'p', name: 'Prancha', region: 'CORE', primaryMuscle: 'ABS' }),
      exercicio({ id: 's', name: 'Supino', region: 'UPPER_BODY', primaryMuscle: 'PECTORAL' }),
    ])

    // Superiores, inferiores, core, corpo inteiro — de cima para baixo, não em
    // ordem alfabética, que colocaria "Core" antes de tudo.
    expect(grupos.map((g) => g.label)).toEqual([
      'Superiores · Peitoral',
      'Inferiores · Quadríceps',
      'Core · Abdômen',
    ])
  })

  it('bíceps e tríceps deixam de ser o mesmo grupo', () => {
    /*
     * É o pedido que originou a classificação: `muscle_group` juntava os dois
     * em ARMS, e quem procurava bíceps recebia a lista inteira de braço.
     */
    const grupos = groupExercisesForSelect([
      exercicio({ id: 'r', name: 'Rosca direta', muscleGroup: 'ARMS', region: 'UPPER_BODY', primaryMuscle: 'BICEPS' }),
      exercicio({ id: 't', name: 'Tríceps corda', muscleGroup: 'ARMS', region: 'UPPER_BODY', primaryMuscle: 'TRICEPS' }),
    ])

    expect(grupos.map((g) => g.label)).toEqual(['Superiores · Bíceps', 'Superiores · Tríceps'])
  })

  it('dentro do grupo, o básico vem antes do auxiliar', () => {
    const [grupo] = groupExercisesForSelect([
      exercicio({ id: '1', name: 'Crucifixo', region: 'UPPER_BODY', primaryMuscle: 'PECTORAL', utility: 'AUXILIARY' }),
      exercicio({ id: '2', name: 'Supino reto', region: 'UPPER_BODY', primaryMuscle: 'PECTORAL', utility: 'BASIC' }),
    ])

    // Ordem alfabética esconderia o supino atrás do crucifixo.
    expect(grupo.exercises.map((e) => e.name)).toEqual(['Supino reto', 'Crucifixo'])
  })

  it('empate de utilidade desempata pelo nome, respeitando acento', () => {
    const [grupo] = groupExercisesForSelect([
      exercicio({ id: '1', name: 'Ômega', region: 'CORE', primaryMuscle: 'ABS' }),
      exercicio({ id: '2', name: 'Abdominal', region: 'CORE', primaryMuscle: 'ABS' }),
      exercicio({ id: '3', name: 'Élan', region: 'CORE', primaryMuscle: 'ABS' }),
    ])
    expect(grupo.exercises.map((e) => e.name)).toEqual(['Abdominal', 'Élan', 'Ômega'])
  })

  it('exercício sem classificação não some — vai para o fim', () => {
    /*
     * Exercício que a academia criou antes da classificação existir. Some da
     * lista seria pior que aparecer fora de ordem: o professor cadastrou e não
     * encontra mais.
     */
    const grupos = groupExercisesForSelect([
      exercicio({ id: 'x', name: 'Aparelho antigo da casa', muscleGroup: 'BACK' }),
      exercicio({ id: 's', name: 'Supino', region: 'UPPER_BODY', primaryMuscle: 'PECTORAL' }),
    ])

    expect(grupos.map((g) => g.label)).toEqual(['Superiores · Peitoral', 'Outros · Costas'])
    expect(grupos.at(-1)?.exercises).toHaveLength(1)
  })

  it('lista vazia devolve nenhum grupo, sem quebrar', () => {
    expect(groupExercisesForSelect([])).toEqual([])
  })
})

describe('texto da opção', () => {
  it('o aparelho desempata as variações do mesmo exercício', () => {
    // "Supino reto" aparece com barra e com halteres: sem o aparelho no rótulo
    // as duas linhas ficam idênticas na lista.
    expect(
      exerciseOptionLabel(exercicio({ id: '1', name: 'Supino reto', equipment: 'banco reto e barra' })),
    ).toBe('Supino reto · banco reto e barra')
  })

  it('sem aparelho, só o nome', () => {
    expect(exerciseOptionLabel(exercicio({ id: '1', name: 'Prancha' }))).toBe('Prancha')
  })
})
