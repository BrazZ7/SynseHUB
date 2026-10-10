import type { BodyPeriod } from '@/types/domain'

/**
 * ── O balde do gráfico de peso ──────────────────────────────────────────────
 *
 * Quantos pontos o gráfico de peso mostra não é quantas vezes a pessoa subiu
 * na balança: é um por dia, por semana ou por mês, conforme a janela. Quem
 * agrupa é o banco (`serie_de_peso`, 0052), e esta régua é o que ele recebe.
 *
 * ── Por que agrupar, e não só paginar ───────────────────────────────────────
 *
 * A leitura das pesagens não tinha teto, e o PostgREST corta a resposta no
 * teto do servidor **sem dar erro**. Como a ordem é decrescente, o corte
 * descarta o **mais antigo** — o gráfico começava depois do começo real e a
 * tela dizia "Últimas N medições" com um N menor que a verdade. Quem acompanha
 * peso há dois anos via o histórico encurtar sozinho.
 *
 * Paginar resolve o histórico, mas não o gráfico: gráfico não tem página, ele
 * mostra a janela inteira. E mandar duas mil linhas para desenhar trezentos
 * pixels é o que fazia o teto ficar perto — alguém que pesa três vezes ao dia
 * gera três pontos onde cabe um, e a diferença entre eles é hidratação, não
 * progresso.
 *
 * Então o banco devolve **um ponto por balde**, e o número de pontos passa a
 * depender do tamanho da janela em vez da frequência de quem pesa.
 */
export type BaldeDaSerie = 'day' | 'week' | 'month'

/**
 * Qual balde cada janela usa, e quantos pontos isso dá no máximo.
 *
 * |     janela     |  balde  | teto de pontos |
 * | -------------- | ------- | -------------- |
 * | 7d, 30d, 3m    | dia     | ~92            |
 * | 6m, 1a, tudo   | semana  | ~53 por ano    |
 *
 * ── Por que "tudo" é semana, e não mês ──────────────────────────────────────
 *
 * Mês dá o melhor teto para quem tem anos de casa, e um gráfico ruim para
 * quem não tem: alguém com quinze pesagens em quatro meses via **quatro
 * pontos**. Isso é pior que o gráfico de antes, e trocaria um defeito que
 * aparece em muito dado por outro que aparece em pouco — que é o caso de
 * quase todo mundo agora.
 *
 * Semana resolve os dois: dezessete pontos para esses quatro meses, e 520
 * para dez anos de assinatura. Cinco centenas é muito ponto para a largura de
 * um gráfico, mas é um teto que **não cresce com a frequência de quem pesa**,
 * que era o problema. Quem pesa três vezes ao dia por dez anos tem onze mil
 * pesagens e continua com 520 pontos.
 */
export function baldeDoPeriodo(periodo: BodyPeriod): BaldeDaSerie {
  switch (periodo) {
    case '7d':
    case '30d':
    case '3m':
      return 'day'
    case '6m':
    case '1a':
    case 'tudo':
      return 'week'
  }
}

/**
 * Um ponto do gráfico de peso.
 *
 * `instante` é o momento da pesagem escolhida, não o início do balde: o rótulo
 * do gráfico diz um dia em que a pessoa de fato subiu na balança. `medicoes`
 * conta quantas caíram naquele balde — é o que permite a tela dizer que está
 * resumindo, em vez de deixar parecer que houve uma só.
 */
export type BodySeriesPoint = {
  instante: string
  pesoKg: number
  medicoes: number
}
