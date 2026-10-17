import type { BaselineChallenge } from '@/types/domain'

/**
 * Cópia do catálogo de desafios que está na migration 0014.
 *
 * Existe só para o modo demonstração, que não tem banco. A fonte da verdade é
 * o SQL — e `tests/db/challenges.test.ts` compara os dois, para a cópia não
 * envelhecer em silêncio no dia em que uma meta mudar.
 */
export const BASELINE_CHALLENGES: BaselineChallenge[] = [
  {
    code: 'CORRIDA_20KM',
    title: 'Meta de corrida',
    description: 'Somar 20 km de corrida ou caminhada no mês. Vale esteira, rua e parque.',
    metric: 'DISTANCE_KM',
    unit: 'km',
    targetValue: 20,
    minTier: 'FREE',
    position: 1,
  },
  {
    code: 'CARDIO_POS_TREINO',
    title: 'Cardio pós-treino',
    description: 'Fazer 12 sessões de 15 minutos de cardio depois do treino de força.',
    metric: 'SESSIONS',
    unit: 'sessões',
    targetValue: 12,
    minTier: 'FREE',
    position: 2,
  },
  {
    code: 'CARGA_PROGRESSIVA',
    title: 'Aumento de carga',
    description: 'Subir 10% na carga total dos seus principais exercícios até o fim do mês.',
    metric: 'LOAD_PERCENT',
    unit: '%',
    targetValue: 10,
    minTier: 'FREE',
    position: 3,
  },
  {
    code: 'CONSTANCIA_12',
    title: 'Constância',
    description: 'Treinar 12 vezes no mês. Conta sozinho, pelos seus check-ins.',
    metric: 'CHECKINS',
    unit: 'treinos',
    targetValue: 12,
    minTier: 'FREE',
    position: 4,
  },
  {
    code: 'MOBILIDADE_300',
    title: 'Mobilidade diária',
    description: '300 minutos de mobilidade e alongamento no mês, 10 por dia.',
    metric: 'MINUTES',
    unit: 'min',
    targetValue: 300,
    minTier: 'PRO',
    position: 5,
  },
  {
    code: 'CONSTANCIA_20',
    title: 'Constância Pro',
    description: 'Treinar 20 vezes no mês. Para quem já tem o hábito e quer subir a régua.',
    metric: 'CHECKINS',
    unit: 'treinos',
    targetValue: 20,
    minTier: 'PRO',
    position: 6,
  },
]

/** Primeiro dia do mês corrente, no mesmo formato que o banco devolve. */
export function currentCycle(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}
