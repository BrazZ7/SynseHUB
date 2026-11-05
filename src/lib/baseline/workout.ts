/**
 * Treino base do Synse.
 *
 * Conteúdo fixo, no código — não uma linha por pessoa no banco. É o mesmo
 * texto para todo mundo: milhares de cópias idênticas só criariam a dúvida de
 * qual é a boa no dia em que ele mudar.
 *
 * Não substitui o treino da academia: é o que aparece enquanto ela não
 * atribuiu nada, e o que existe para quem treina sem academia. Escolha
 * conservadora de propósito — exercícios básicos, carga sugerida ausente,
 * cadência clara. Prescrever carga para quem nunca foi avaliado seria
 * atravessar o trabalho do profissional.
 */
export type BaselineExercise = {
  name: string
  sets: number
  reps: string
  restSeconds: number
  note?: string
}

export type BaselineSession = {
  label: string
  focus: string
  exercises: BaselineExercise[]
}

export const BASELINE_WORKOUT: {
  name: string
  summary: string
  frequency: string
  sessions: BaselineSession[]
  disclaimer: string
} = {
  name: 'Treino base Synse',
  summary: 'Corpo inteiro, três vezes por semana, com dia de descanso entre as sessões.',
  frequency: '3× por semana',
  sessions: [
    {
      label: 'A',
      focus: 'Corpo inteiro — empurrar',
      exercises: [
        { name: 'Agachamento livre ou no smith', sets: 3, reps: '10 a 12', restSeconds: 90 },
        { name: 'Supino reto com halteres', sets: 3, reps: '10 a 12', restSeconds: 90 },
        { name: 'Desenvolvimento sentado', sets: 3, reps: '12', restSeconds: 60 },
        { name: 'Tríceps na polia', sets: 3, reps: '12 a 15', restSeconds: 45 },
        { name: 'Prancha isométrica', sets: 3, reps: '30 a 45 segundos', restSeconds: 45 },
      ],
    },
    {
      label: 'B',
      focus: 'Corpo inteiro — puxar',
      exercises: [
        { name: 'Puxada frontal na polia', sets: 3, reps: '10 a 12', restSeconds: 90 },
        { name: 'Remada baixa', sets: 3, reps: '10 a 12', restSeconds: 90 },
        {
          name: 'Levantamento terra romeno',
          sets: 3,
          reps: '10',
          restSeconds: 90,
          note: 'Carga leve até a técnica ficar firme.',
        },
        { name: 'Rosca direta', sets: 3, reps: '12', restSeconds: 45 },
        { name: 'Abdominal infra', sets: 3, reps: '15', restSeconds: 45 },
      ],
    },
    {
      label: 'C',
      focus: 'Pernas e condicionamento',
      exercises: [
        { name: 'Leg press', sets: 4, reps: '12', restSeconds: 90 },
        { name: 'Cadeira extensora', sets: 3, reps: '12 a 15', restSeconds: 60 },
        { name: 'Mesa flexora', sets: 3, reps: '12', restSeconds: 60 },
        { name: 'Panturrilha em pé', sets: 4, reps: '15', restSeconds: 45 },
        {
          name: 'Cardio contínuo',
          sets: 1,
          reps: '15 a 20 minutos',
          restSeconds: 0,
          note: 'Ritmo em que dá para conversar.',
        },
      ],
    },
  ],
  disclaimer:
    'Treino base, igual para todo mundo. Não substitui avaliação física nem prescrição individual — quando sua academia atribuir um plano, ele aparece aqui no lugar deste.',
}
