/**
 * ── Quantas avaliações a tela lê ────────────────────────────────────────────
 *
 * `listAssessments` lia o histórico inteiro de um aluno, sem teto. O conjunto
 * cresce devagar — uma avaliação por mês dá doze por ano —, mas cresce para
 * sempre, e a ficha do aluno usa essa leitura para **três** coisas de
 * naturezas diferentes:
 *
 * - a última e a penúltima, para a variação de peso;
 * - o gráfico de peso;
 * - a altura mais recente, para o IMC.
 *
 * O gráfico é o que impede simplesmente paginar: gráfico não tem página. Mas
 * ele também não quer o histórico inteiro — a lição da 0052 é que mandar
 * milhares de linhas para desenhar trezentos pixels é o que faz o teto ficar
 * perto. Dois anos de avaliações mensais já são mais pontos do que cabem
 * legíveis numa ficha.
 *
 * Então o teto passa a ser **escrito**, e não herdado do servidor: a tela pede
 * a janela que desenha, e diz na legenda qual é. Teto que o código conhece é
 * diferente de corte silencioso, mesmo quando o número é parecido.
 */

/**
 * O que a ficha do aluno desenha: dois anos de avaliações mensais.
 *
 * Acima disso o gráfico vira uma linha densa que não se lê, e a conversa com
 * o aluno é sobre os últimos meses, não sobre 2021.
 */
export const AVALIACOES_NA_FICHA = 24

/**
 * O que a tela de nova avaliação precisa: a anterior, para comparar, e a
 * altura mais recente. Seis cobrem o ano e sobram.
 */
export const AVALIACOES_NO_FORMULARIO = 6
