/**
 * ── A meta da semana ────────────────────────────────────────────────────────
 *
 * Não existe coluna de meta no banco, e pôr um número redondo fixo — 50 km,
 * como aparece em todo aplicativo de corrida — seria mentir para quem corre
 * oito. A meta aqui sai do histórico da própria pessoa: a média das quatro
 * semanas anteriores, arredondada para cima.
 *
 * Arredondar para cima é o único empurrão. Um multiplicador de esticada
 * ("+10% toda semana") vira esteira: a meta foge para sempre e a pessoa
 * desiste. Transformar isso num programa de progressão é decisão do dono do
 * produto, não deste arquivo.
 *
 * O passo do arredondamento acompanha o tamanho da semana. Para quem corre 6
 * km, saltar de 5 em 5 dobraria a meta; para quem corre 60, subir de 1 em 1
 * não significa nada.
 */

/** Abaixo deste piso a meta não desce: 5 km é uma semana inteira de caminhada. */
export const META_MINIMA_METROS = 5_000

/** Quanto mais longa a semana, mais grosso o degrau. */
export const DEGRAUS = [
  { abaixoDe: 10_000, passo: 1_000 },
  { abaixoDe: 40_000, passo: 5_000 },
] as const

export const DEGRAU_MAXIMO = 10_000

/** Quantas semanas fechadas entram na média. */
export const SEMANAS_DE_BASE = 4

/**
 * A meta, em metros, a partir da média semanal recente.
 *
 * Devolve `null` para quem ainda não tem histórico: sem base, qualquer número
 * seria chute, e um alvo inventado na primeira semana de uso é pior do que
 * nenhum.
 */
export function metaDaSemana(mediaMetros: number): number | null {
  if (!Number.isFinite(mediaMetros) || mediaMetros <= 0) return null

  const passo = DEGRAUS.find((degrau) => mediaMetros < degrau.abaixoDe)?.passo ?? DEGRAU_MAXIMO
  const arredondada = Math.ceil(mediaMetros / passo) * passo

  return Math.max(META_MINIMA_METROS, arredondada)
}

/**
 * O progresso, em duas medidas que **não** são a mesma.
 *
 * `fracao` é limitada a 1 porque a barra não tem para onde crescer. O
 * `percentual` não é limitado, porque quem passou da meta merece ler que
 * passou. Reaproveitar um valor para as duas coisas foi exatamente o defeito
 * do cartão de medalha: 17 check-ins numa meta de 12 apareciam como "100%", e
 * o cartão engolia o feito.
 */
export function progressoDaMeta(percorridoMetros: number, metaMetros: number) {
  if (!Number.isFinite(percorridoMetros) || !Number.isFinite(metaMetros) || metaMetros <= 0) {
    return { fracao: 0, percentual: 0 }
  }

  const bruta = Math.max(0, percorridoMetros / metaMetros)

  return { fracao: Math.min(1, bruta), percentual: Math.round(bruta * 100) }
}
