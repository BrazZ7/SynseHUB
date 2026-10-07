import {
  CLASSES_DA_LEITURA,
  CLASSES_DA_LINHA_INTEIRA,
  CLASSES_DA_PILHA,
} from '@/components/synse/duas-colunas-classes'
import { cn } from '@/lib/utils'

/**
 * ── Duas colunas no tablet ───────────────────────────────────────────────────
 *
 * O Synse App nasceu como pilha de cartões de largura de telefone. Num iPad
 * isso deixava metade da tela vazia, e só alargar a coluna não resolve: uma
 * pilha de coluna única esticada troca o vazio dos lados por cartões largos
 * demais. Quem usa tablet quer **ver mais de uma coisa ao mesmo tempo** — é
 * para isso que a tela é maior.
 *
 * ── Por que coluna de CSS, e não grade ──────────────────────────────────────
 *
 * A tentação é `grid md:grid-cols-2`. Numa grade, cada linha tem a altura do
 * cartão mais alto dela, e esta pilha tem cartões de 80px ao lado de cartões
 * de 400px: a grade abriria buracos entre eles. `columns-2` empilha cada
 * coluna de forma independente e equilibra a altura das duas — é o layout de
 * revista, e é o que serve a cartões de altura imprevisível.
 *
 * (Para lista de itens **iguais** a conclusão se inverte, e aí é grade mesmo:
 * ver `GRADE_DE_ITENS`.)
 *
 * O ganho decisivo é outro, e é de celular: **a ordem do DOM não muda**. O
 * navegador corta a mesma pilha em duas; no telefone `columns` vale 1 e a
 * página é exatamente o que sempre foi. Dividir os cartões em dois contêineres
 * à mão daria o mesmo visual no tablet e estragaria o celular — a segunda
 * coluna inteira cairia depois da primeira, e o celular é onde o aluno está.
 *
 * Leitor de tela e tecla Tab seguem o DOM, que aqui é a ordem visual: desce a
 * coluna da esquerda, depois desce a da direita. É como se lê jornal.
 *
 * ── A regra que não cabe numa classe ────────────────────────────────────────
 *
 * As outras duas (`break-inside-avoid` e margem em vez de `space-y`) moram em
 * `CLASSES_DA_PILHA`, documentadas lá. Esta não dá para escrever em CSS:
 * **nada de `position: sticky` aqui dentro**. Sticky não funciona em
 * multi-coluna, e não avisa — o cartão só não gruda. Hoje o app do aluno não
 * usa nenhum; um teste guarda isso, e o dia em que alguém precisar de um
 * cartão grudado, ele sai da pilha.
 */
export function PilhaDoApp({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={cn(CLASSES_DA_PILHA, className)}>{children}</div>
}

/**
 * Um bloco que atravessa as duas colunas.
 *
 * `column-span: all` só vale em filho direto do contêiner multi-coluna, e é
 * por isso que isto é uma casca por fora em vez de uma classe solta: o que
 * atravessa é a casca, e o conteúdo vai dentro dela — inclusive um `<header>`,
 * que assim continua sendo um `<header>`.
 *
 * Tudo que vem **antes** de um bloco destes forma o próprio par de colunas,
 * acima dele. Na prática: cabeçalho e chamada principal no topo, atravessando;
 * o resto da pilha se divide embaixo.
 */
export function LinhaInteira({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={cn(CLASSES_DA_LINHA_INTEIRA, className)}>{children}</div>
}

/**
 * Uma coluna só, estreita, para quem está lendo ou preenchendo.
 *
 * A casca do app vai a 64rem no desktop porque **duas** colunas cabem lá
 * dentro. Uma página de leitura não se divide — receita, artigo, treino em
 * andamento, formulário de pesagem, lista de notificações — e esticar o texto
 * dela até 64rem traria de volta o problema que a divisão resolveu: linha
 * longa demais, o olho perdendo a volta no fim de cada uma.
 *
 * Elas não usam `PilhaDoApp` justamente porque o passo a passo tem ordem — a
 * segunda coluna faria a pessoa pular do fim de uma para o alto da outra no
 * meio de uma sequência.
 */
export function ColunaDeLeitura({
  children,
  className,
  /**
   * O elemento de verdade. Artigo e receita são `<article>`, e trocar isso por
   * um `div` tiraria do leitor de tela o "artigo" que ele anuncia e a
   * navegação por região que vem junto. Largura é assunto de folha de estilo;
   * não pode custar marcação.
   */
  como: Elemento = 'div',
}: {
  children: React.ReactNode
  className?: string
  como?: 'div' | 'article' | 'section'
}) {
  return <Elemento className={cn(CLASSES_DA_LEITURA, className)}>{children}</Elemento>
}

export { GRADE_DE_ITENS } from '@/components/synse/duas-colunas-classes'
