/**
 * O que é de graça e o que é do Pro.
 *
 * A régua: o plano gratuito precisa ser útil sozinho — treino, alimentação e
 * um desafio por mês, com medalha no fim. Quem nunca pagar nada ainda tem um
 * produto inteiro na mão. O Pro não desbloqueia o básico; ele multiplica
 * (vários desafios), aprofunda (histórico e análise longos) e personaliza.
 *
 * Prender o básico atrás do pagamento renderia algumas assinaturas de quem já
 * estava convencido e perderia todo mundo que ainda não estava — e é esse todo
 * mundo que a academia traz.
 */
export type UserTier = 'FREE' | 'PRO'

/**
 * O preço do Synse+, num lugar só.
 *
 * R$ 29,00/mês, decidido pelo dono do produto. Mora aqui e não espalhado pelas
 * telas porque preço muda, e mudar não pode virar caçada — a tela do Synse+, a
 * do teste grátis e o aviso de renovação leem todos daqui.
 *
 * O primeiro ciclo custa zero: é uma assinatura só, com o primeiro mês
 * cobrado R$ 0,00 e renovação automática pelo valor cheio. Não é "assinatura
 * grátis que muda de preço" — essa distinção importa porque Asaas, App Store e
 * Google Play modelam teste grátis nativamente, e "trocar o preço na
 * renovação" seria construir na mão o que eles já fazem.
 */
export const PLUS_PRICE = {
  /** Valor mensal cheio, em reais. */
  monthly: 29,
  /** Dias do primeiro ciclo, cobrado R$ 0,00. */
  trialDays: 30,
} as const

export const TIER_LABELS: Record<UserTier, string> = {
  FREE: 'Synse',
  PRO: 'Synse+',
}

/** Quantos desafios a pessoa pode manter no mesmo ciclo. */
export const CHALLENGES_PER_CYCLE: Record<UserTier, number> = {
  FREE: 1,
  PRO: 6,
}

/** Meses de histórico visíveis no app. */
export const HISTORY_MONTHS: Record<UserTier, number> = {
  FREE: 3,
  PRO: 36,
}

export type TierFeature = {
  title: string
  free: string | false
  pro: string
}

export const TIER_COMPARISON: TierFeature[] = [
  {
    title: 'Treino base Synse',
    free: 'Corpo inteiro, 3 dias por semana',
    pro: 'Base + programas guiados de 21, 30, 60 e 90 dias',
  },
  {
    title: 'Plano alimentar base',
    free: 'Cardápio base com trocas',
    pro: 'Cardápios por objetivo e receitas Synse',
  },
  {
    title: 'Desafios do mês',
    free: 'Um por mês, à sua escolha',
    pro: 'Até seis por mês, incluindo os desafios Pro',
  },
  {
    title: 'Medalhas e análise mensal',
    free: 'Medalha e resumo do mês',
    pro: 'Análise comparada entre meses e evolução de carga',
  },
  { title: 'Check-in e frequência', free: 'Completo', pro: 'Completo' },
  { title: 'Histórico', free: '3 meses', pro: '3 anos' },
  { title: 'Biblioteca Synse', free: false, pro: 'E-books, guias e conteúdo exclusivo' },
  { title: 'Ranking entre amigos', free: false, pro: 'Opcional, com sua autorização' },
]

export function canChooseAnotherChallenge(tier: UserTier, chosenThisCycle: number): boolean {
  return chosenThisCycle < CHALLENGES_PER_CYCLE[tier]
}
