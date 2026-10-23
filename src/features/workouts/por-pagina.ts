/**
 * ── Quantas fichas a tela de treinos mostra ─────────────────────────────────
 *
 * `listWorkoutPlans` lia **todas** as fichas da academia, sem teto. Professor
 * cria ficha e não apaga: uma academia de três anos chega a centenas, e numa
 * rede com várias unidades na mesma organização isso cresce mais rápido ainda.
 *
 * O corte do PostgREST aqui seria especialmente traiçoeiro porque a ordem é
 * por divisão (`split_label`): o que sumiria não seria "as mais antigas" — e
 * sim todas as divisões do fim do alfabeto. Um treino "E — Pernas" deixaria
 * de existir para a tela, e quem o procurasse concluiria que foi apagado.
 *
 * Vinte e quatro cartões são oito linhas de três no desktop e cabem num
 * rolar; a barra de paginação diz o total, que é o que faltava.
 */
export const FICHAS_POR_PAGINA = 24
