import { z } from 'zod'

/**
 * ── Um identificador, e não um UUID ──────────────────────────────────────────
 *
 * Estes campos exigiam `uuid()`, e isso quebrava a montagem de treino inteira
 * no modo de demonstração: lá os identificadores são legíveis — `exr_0018`,
 * `staff_0001` — como em todo o resto da base de exemplo. O formulário recusava
 * com "Escolha um exercício da biblioteca" logo depois de a pessoa escolher um,
 * que é o pior tipo de erro: o que acusa quem fez tudo certo.
 *
 * Trocar por "texto não vazio" não afrouxa nada que importasse. Um UUID bem
 * formado que não existe é recusado do mesmo jeito, e quem recusa é a chave
 * estrangeira; um id de outra academia é barrado pela RLS. A asserção de
 * formato só comprava uma mensagem mais bonita para entrada malformada — e
 * cobrava por isso o modo de demonstração, que é onde a academia conhece o
 * produto.
 *
 * O limite de 64 evita que um campo colado com um texto inteiro chegue ao
 * banco só para ser recusado lá.
 */
const identificador = (mensagem: string) => z.string().trim().min(1, mensagem).max(64, mensagem)

/**
 * Um exercício dentro do treino.
 *
 * `reps` é texto de propósito: a prescrição real do dia a dia é "12", mas
 * também "8-10", "até a falha" e "30 s por lado". Guardar número obrigaria a
 * inventar uma convenção que o professor não usa, e ele acabaria escrevendo a
 * verdade no campo de observação.
 */
export const workoutExerciseSchema = z.object({
  exerciseId: identificador('Escolha um exercício da biblioteca.'),
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

/** Edição: o mesmo treino da criação, mais o id de quem está sendo regravado. */
export const updateWorkoutSchema = createWorkoutSchema.extend({
  planId: identificador('Treino não identificado.'),
})

/**
 * A semana inteira de uma vez.
 *
 * Cada dia vira um `workout_plans` separado, como sempre foi — a semana é um
 * jeito de montar, não uma entidade nova no banco. O limite de sete dias é a
 * semana; quem precisa de mais está montando outra coisa.
 */
export const createWeekSchema = z.object({
  goal: z.string().trim().max(120).optional().default(''),
  days: z
    .array(
      z.object({
        splitLabel: z.string().trim().min(1, 'Informe a divisão do dia.').max(8),
        name: z.string().trim().min(2, 'Dê um nome ao dia.').max(60),
        exercises: z
          .array(workoutExerciseSchema)
          .min(1, 'Cada dia precisa de ao menos um exercício.')
          .max(30),
      }),
    )
    .min(1, 'Monte ao menos um dia.')
    .max(7, 'Sete dias é uma semana; para mais que isso, monte outra.'),
})

export const assignWorkoutSchema = z.object({
  workoutPlanId: identificador('Treino não identificado.'),
  studentId: identificador('Escolha um aluno.'),
  /** Vazio significa sem prazo — o treino vale até ser trocado. */
  validUntil: z.string().trim().optional().default(''),
})

export type CreateWorkoutInput = z.infer<typeof createWorkoutSchema>
export type CreateWeekInput = z.infer<typeof createWeekSchema>
