import type { ContentItem } from '@/types/domain'

/**
 * ── A situação de um conteúdo ───────────────────────────────────────────────
 *
 * Não existe coluna `status` em `content_library`: a situação é derivada de
 * `published_at` comparado com **agora**. Três estados, e a diferença entre
 * eles é o que a tela usa para repartir a lista:
 *
 * - sem data            → rascunho, nunca saiu;
 * - data no passado     → publicado, o aluno vê;
 * - data no futuro      → agendado, vai sair sozinho.
 *
 * Módulo puro de propósito. A regra é a mesma em três lugares — a listagem do
 * painel, o acervo da plataforma e a contagem dos cartões — e escrita três
 * vezes ela divergiria no dia em que "agendado" passasse a contar como
 * publicado em um deles.
 */

export type SituacaoDoConteudo = 'PUBLICADO' | 'AGENDADO' | 'RASCUNHO'

/** O que o filtro da tela aceita. `TODOS` é a ausência de filtro. */
export type FiltroDeSituacao = SituacaoDoConteudo | 'TODOS'

export const SITUACOES: { valor: FiltroDeSituacao; rotulo: string }[] = [
  { valor: 'TODOS', rotulo: 'Todos' },
  { valor: 'PUBLICADO', rotulo: 'Publicados' },
  { valor: 'AGENDADO', rotulo: 'Agendados' },
  { valor: 'RASCUNHO', rotulo: 'Rascunhos' },
]

export function situacaoDoConteudo(
  item: Pick<ContentItem, 'publishedAt'>,
  agora: Date = new Date(),
): SituacaoDoConteudo {
  if (!item.publishedAt) return 'RASCUNHO'
  return item.publishedAt <= agora.toISOString() ? 'PUBLICADO' : 'AGENDADO'
}

/**
 * O filtro veio da barra de endereços, então pode ser qualquer coisa.
 *
 * Valor desconhecido vira `TODOS` em vez de lista vazia: `?situacao=lixo`
 * mostrando "nenhum conteúdo" faria a pessoa achar que o acervo sumiu.
 */
export function filtroDeSituacao(bruto: string | undefined): FiltroDeSituacao {
  const encontrado = SITUACOES.find((s) => s.valor === bruto?.toUpperCase())
  return encontrado?.valor ?? 'TODOS'
}

/** Quantos de cada situação. O que os cartões e as abas mostram. */
export type ContagemDeConteudo = {
  total: number
  publicados: number
  agendados: number
  rascunhos: number
  /** Dos publicados, quantos são só para assinante. Só o acervo usa. */
  doPlus: number
}

export const CONTAGEM_VAZIA: ContagemDeConteudo = {
  total: 0,
  publicados: 0,
  agendados: 0,
  rascunhos: 0,
  doPlus: 0,
}

/**
 * Quantos a página deve mostrar.
 *
 * Vinte e cinco, como as outras telas de trabalho do painel. Conteúdo é
 * leitura, não triagem: rolar duzentos itens para achar um rascunho é pior do
 * que trocar de página.
 */
export const CONTEUDOS_POR_PAGINA = 25
