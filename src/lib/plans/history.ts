import { HISTORY_MONTHS, type UserTier } from '@/lib/plans/tiers'

/**
 * ── Até onde o histórico volta ──────────────────────────────────────────────
 *
 * `HISTORY_MONTHS` existia desde o começo — 3 meses no gratuito, 36 no Synse+ —
 * e **nenhuma tela o usava**. A comparação da página do Synse+ prometia "3
 * meses" contra "3 anos", e as duas viam a mesma coisa. Com um botão de assinar
 * e um preço fechado na tela, prometer o que não se cumpre deixou de ser dívida
 * técnica.
 *
 * ── O recorte é do servidor, não do seletor ─────────────────────────────────
 *
 * O seletor esconde a opção; quem recusa é a leitura. É a regra da casa: o
 * front-end usa o plano apenas para esconder UI, e forjar `?periodo=tudo` na
 * barra de endereços não pode devolver um ano de dados para quem tem três
 * meses.
 *
 * ── Por que o Synse+ recebe "tudo", e não exatos 36 meses ───────────────────
 *
 * Porque cortar o histórico de quem paga seria hostil sem ganhar nada. A
 * promessa é um piso — "três anos" —, e esconder a medição de quatro anos atrás
 * de uma pessoa que continua assinando não protege receita nenhuma: ela já
 * está pagando. O corte existe para diferenciar o gratuito, e é lá que ele
 * morde.
 */

/** Meses de histórico que o plano garante. */
export function mesesDoHistorico(tier: UserTier): number {
  return HISTORY_MONTHS[tier]
}

/**
 * O dia mais antigo que o plano deixa ver. `null` quando não há limite.
 *
 * Nulo e não uma data muito antiga: "sem limite" é uma condição, e representá-la
 * por um ano arbitrário faria a consulta filtrar por algo que ninguém decidiu.
 */
export function inicioDoHistorico(tier: UserTier, agora: Date = new Date()): Date | null {
  if (tier === 'PRO') return null

  const inicio = new Date(agora)
  inicio.setMonth(inicio.getMonth() - mesesDoHistorico(tier))
  return inicio
}

/**
 * Recorta uma janela pedida em dias ao que o plano permite.
 *
 * `0` significa "tudo" na tela de corrida, e é justamente o caso que precisa
 * virar um número no gratuito — senão "tudo" seria a porta que passa por cima
 * do limite.
 */
export function recortarDias(tier: UserTier, diasPedidos: number): number {
  if (tier === 'PRO') return diasPedidos

  // Aproximação de mês por 30 dias: o limite é comercial, não contábil, e um
  // dia a mais ou a menos na borda não muda o que a pessoa vê.
  const teto = mesesDoHistorico(tier) * 30
  if (diasPedidos <= 0) return teto
  return Math.min(diasPedidos, teto)
}

/**
 * A janela pedida passa do que o plano permite?
 *
 * É isto que o seletor usa para desenhar o cadeado — e o mesmo cálculo que a
 * leitura usa para recortar, para os dois nunca discordarem.
 */
export function janelaBloqueada(tier: UserTier, diasPedidos: number): boolean {
  if (tier === 'PRO') return false
  const teto = mesesDoHistorico(tier) * 30
  return diasPedidos <= 0 || diasPedidos > teto
}
