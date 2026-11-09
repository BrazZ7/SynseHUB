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
 * grátis que muda de preço" — essa distinção importa porque gateway, App Store e
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

/**
 * ── Duas linhas que prometiam o que não existe ──────────────────────────────
 *
 * O treino dizia "Base + programas guiados de 21, 30, 60 e 90 dias" e a
 * alimentação, "Cardápios por objetivo e receitas Synse". Nenhum dos dois é
 * verdade: `programs`, `program_steps`, `program_enrollments` e `recipes`
 * existem no banco desde a 0003 e **não têm uma leitura sequer** no
 * aplicativo. Nenhuma tela de treino ou de nutrição olha o plano da conta.
 *
 * Passou despercebido enquanto ninguém pagava. Deixou de passar no dia em que
 * o Mercado Pago entrou: a tabela virou a descrição do que a pessoa compra.
 *
 * As duas agora dizem o mesmo nos dois lados, como "Check-in e frequência" já
 * fazia. Não é derrota — é a razão de a tabela mostrar as duas colunas, e
 * está escrita na página: lista só de vantagens do pago dá a impressão de que
 * nada funciona sem assinar.
 *
 * `tests/unit/comparativo-honesto.test.ts` prende isso ao código: enquanto
 * aquelas tabelas não forem lidas em lugar nenhum, a comparação não pode
 * prometê-las.
 *
 * ── E o teste soltou, como prometido ────────────────────────────────────────
 *
 * A 0043 construiu os programas guiados: `programs` e `program_steps` passam
 * a ser lidas pelas telas de `/app/programs` e `/synse-admin/programas`. A
 * linha do treino voltou a anunciá-los, e o guarda deixou — foi exatamente
 * para isso que ele foi escrito para se soltar sozinho.
 *
 * ── E soltou de novo ───────────────────────────────────────────────────────
 *
 * A 0044 construiu a biblioteca de receitas: `recipes` passa a ser lida pelas
 * telas de `/app/nutrition/receitas` e `/synse-admin/receitas`. Era a última
 * tabela daquela leva da 0003 sem uma leitura sequer, e a linha da alimentação
 * volta a poder dizer o que o Synse+ acrescenta.
 *
 * O que ela diz agora é o que existe, nem mais: o cardápio base é o mesmo para
 * todo mundo — o Synse+ não dá outro plano alimentar —, e o que entra é a
 * biblioteca de receitas marcada como paga. Prometer "cardápio por objetivo"
 * seria reabrir exatamente o buraco que este comentário registra.
 */
export const TIER_COMPARISON: TierFeature[] = [
  {
    title: 'Treino base Synse',
    free: 'Corpo inteiro, 3 dias por semana',
    pro: 'Base + programas guiados, dia a dia',
  },
  {
    title: 'Plano alimentar base',
    free: 'Cardápio base com trocas',
    pro: 'Cardápio base + receitas Synse',
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
