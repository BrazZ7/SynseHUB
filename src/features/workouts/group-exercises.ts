import {
  BODY_REGION_LABELS,
  BODY_REGION_ORDER,
  MUSCLE_GROUP_LABELS,
  MUSCLE_TARGET_LABELS,
} from '@/features/workouts/labels'
import type { Exercise } from '@/types/domain'

export type ExerciseGroup = { label: string; exercises: Exercise[] }

/**
 * Agrupa a biblioteca para a lista de escolha.
 *
 * Uma lista corrida com 132 exercícios é pior que uma lista vazia: a pessoa
 * rola, desiste e escolhe o primeiro que reconhece. Agrupada por região e
 * músculo, ela se lê como a ficha de treino que o professor já monta na
 * cabeça — superiores/peitoral, inferiores/quadríceps.
 *
 * Exercício sem classificação — criado pela academia antes da 0021, ou vindo
 * da demonstração — cai no grupo do `muscle_group` antigo em vez de sumir.
 */
export function groupExercisesForSelect(exercises: readonly Exercise[]): ExerciseGroup[] {
  const grupos = new Map<string, { ordem: number; label: string; exercises: Exercise[] }>()

  for (const exercicio of exercises) {
    const posicaoRegiao = exercicio.region ? BODY_REGION_ORDER.indexOf(exercicio.region) : -1
    /*
     * Sem região conhecida o exercício vai para o fim da lista, e não para o
     * começo: o catálogo classificado é o que se usa, e o avulso é a exceção.
     */
    const ordemRegiao = posicaoRegiao >= 0 ? posicaoRegiao : BODY_REGION_ORDER.length

    const musculo = exercicio.primaryMuscle
      ? MUSCLE_TARGET_LABELS[exercicio.primaryMuscle]
      : MUSCLE_GROUP_LABELS[exercicio.muscleGroup]

    const regiao = exercicio.region ? BODY_REGION_LABELS[exercicio.region] : 'Outros'
    const label = `${regiao} · ${musculo}`

    const atual = grupos.get(label)
    if (atual) atual.exercises.push(exercicio)
    else grupos.set(label, { ordem: ordemRegiao, label, exercises: [exercicio] })
  }

  return [...grupos.values()]
    .sort((a, b) => a.ordem - b.ordem || a.label.localeCompare(b.label, 'pt-BR'))
    .map((grupo) => ({
      label: grupo.label,
      /*
       * Dentro do grupo, os básicos primeiro. São os que sustentam o treino, e
       * quem monta ficha começa por eles — deixá-los no meio da ordem
       * alfabética esconde o supino atrás da crucifixo.
       */
      exercises: [...grupo.exercises].sort(
        (a, b) =>
          Number(b.utility === 'BASIC') - Number(a.utility === 'BASIC') ||
          a.name.localeCompare(b.name, 'pt-BR'),
      ),
    }))
}

/** O texto de uma opção: o nome, e o aparelho para desempatar as variações. */
export function exerciseOptionLabel(exercicio: Exercise): string {
  return exercicio.equipment ? `${exercicio.name} · ${exercicio.equipment}` : exercicio.name
}
