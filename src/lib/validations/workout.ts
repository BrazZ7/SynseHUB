import { z } from 'zod'

/**
 * Um exercício dentro do treino.
 *
 * `reps` é texto de propósito: a prescrição real do dia a dia é "12", mas
 * também "8-10", "até a falha" e "30 s por lado". Guardar número obrigaria a
 * inventar uma convenção que o professor não usa, e ele acabaria escrevendo a
 * verdade no campo de observação.
 */
export const workoutExerciseSchema = z.object({
  exerciseId: z.string().uuid('Escolha um exercício da biblioteca.'),
  sets: z.coerce.number().int().min(1, 'Ao menos uma série.').max(20),
  reps: z.string().trim().min(1, 'Diga quantas repetições.').max(24),
  restSeconds: z.coerce.number().int().min(0).max(600).default(60),
  suggestedLoad: z.coerce.number().min(0).max(1000).optional(),
  notes: z.string().trim().max(160).optional().default(''),
})

export const createWorkoutSchema = z.object({
  name: z.string().trim().min(2, 'Dê um nome ao treino.').max(60),
  goal: z.string().trim().max(120).optional().default(''),
  /** Divisão: A, B, C… É como a academia já chama, e cabe numa etiqueta. */
  splitLabel: z.string().trim().min(1, 'Informe a divisão.').max(8).default('A'),
  exercises: z
    .array(workoutExerciseSchema)
    .min(1, 'Um treino sem exercício abre em branco para o aluno.')
    .max(30, 'Trinta exercícios é mais do que cabe numa sessão.'),
})

export const assignWorkoutSchema = z.object({
  workoutPlanId: z.string().uuid(),
  studentId: z.string().uuid('Escolha um aluno.'),
  /** Vazio significa sem prazo — o treino vale até ser trocado. */
  validUntil: z.string().trim().optional().default(''),
})

export type CreateWorkoutInput = z.infer<typeof createWorkoutSchema>
