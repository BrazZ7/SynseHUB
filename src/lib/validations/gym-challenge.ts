import { z } from 'zod'

/**
 * As métricas e o que cada uma significa na tela.
 *
 * `auto` é sempre verdadeiro aqui de propósito: só entram métricas que o
 * sistema mede sozinho. Passos e hidratação ficaram de fora — seriam número
 * digitado pelo aluno, e ranking sobre valor auto-declarado é competição de
 * quem mente melhor.
 */
export const METRICAS = {
  CHECKINS: { label: 'Check-ins', unidade: 'check-ins', dica: 'Entradas na academia.' },
  WORKOUTS: { label: 'Treinos concluídos', unidade: 'treinos', dica: 'Treinos finalizados no app.' },
  SETS: { label: 'Séries', unidade: 'séries', dica: 'Séries registradas no Treino Ativo.' },
  VOLUME_KG: { label: 'Volume', unidade: 'kg', dica: 'Carga × repetições, somadas.' },
  CLASS_ATTENDANCE: { label: 'Presença em aulas', unidade: 'aulas', dica: 'Presença confirmada na chamada.' },
} as const

export type MetricaChave = keyof typeof METRICAS

export const saveGymChallengeSchema = z
  .object({
    title: z.string().trim().min(3, 'Dê um nome ao desafio.').max(80),
    description: z.string().trim().max(400).optional().default(''),
    metric: z.enum(['CHECKINS', 'WORKOUTS', 'SETS', 'VOLUME_KG', 'CLASS_ATTENDANCE']),
    targetValue: z.coerce
      .number()
      .positive('A meta precisa ser maior que zero.')
      .max(10_000_000),
    startsAt: z.string().date('Informe o início.'),
    endsAt: z.string().date('Informe o fim.'),
    rankingEnabled: z.coerce.boolean().default(false),
    status: z.enum(['DRAFT', 'ACTIVE', 'CLOSED']).default('ACTIVE'),
    reward: z.string().trim().max(120).optional().default(''),
  })
  .refine((v) => v.endsAt >= v.startsAt, {
    message: 'O fim não pode ser antes do início.',
    path: ['endsAt'],
  })

export const joinChallengeSchema = z.object({
  challengeId: z.string().min(1),
  rankingOptIn: z.coerce.boolean().default(false),
})
