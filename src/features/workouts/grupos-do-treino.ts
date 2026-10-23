import type { Exercise, MuscleGroup, WorkoutExercise } from '@/types/domain'

/**
 * Os grupos que um treino trabalha, e como eles viram legenda.
 *
 * Fora do componente de página porque é regra, não marcação: a ordem decide o
 * nome que o treino ganha na tela, e regra que decide nome precisa de teste.
 */

/**
 * Os grupos, na ordem em que pesam.
 *
 * Ordenado por quantidade de exercícios, e **não** pela ordem da ficha: num
 * treino com cinco de perna e um de core, "Pernas" é o nome dele. A ordem da
 * ficha começaria pelo aquecimento e chamaria de core um treino de perna.
 *
 * O desempate é pela ordem de aparição, e isso importa: `Map` em JavaScript
 * preserva a ordem de inserção, e `sort` é estável desde o ES2019 — então dois
 * grupos com o mesmo peso saem na ordem em que apareceram na ficha, que é
 * previsível, em vez de na ordem que o motor quiser.
 */
export function gruposTrabalhados(
  exercicios: Array<WorkoutExercise & { exercise: Exercise }>,
): MuscleGroup[] {
  const peso = new Map<MuscleGroup, number>()
  for (const item of exercicios) {
    const grupo = item.exercise.muscleGroup
    peso.set(grupo, (peso.get(grupo) ?? 0) + 1)
  }
  return [...peso.entries()].sort((a, b) => b[1] - a[1]).map(([grupo]) => grupo)
}

/**
 * Os grupos que a legenda da capa mostra.
 *
 * Três no máximo, e `FULL_BODY` sozinho come os outros: "Corpo inteiro · Peito
 * · Pernas" diz duas vezes a mesma coisa e gasta a linha inteira num telefone.
 */
export function legendaDosGrupos(grupos: MuscleGroup[]): MuscleGroup[] {
  if (grupos.includes('FULL_BODY')) return ['FULL_BODY']
  return grupos.slice(0, 3)
}
