/**
 * Quantas receitas por página.
 *
 * Doze, e não as 25 das telas de trabalho do painel: receita é cartão com
 * imagem e tempo de preparo, não linha de tabela. Doze cobrem o catálogo de
 * hoje inteiro numa página e dão à pessoa uma tela que se lê de uma vez.
 *
 * Mora num módulo próprio porque o data source e as duas telas precisam do
 * mesmo número, e `recipe.ts` é de validação — número de linhas por página
 * não é regra de validação.
 */
export const RECEITAS_POR_PAGINA = 12
