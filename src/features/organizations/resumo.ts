/**
 * ── O resumo bruto de uma academia ──────────────────────────────────────────
 *
 * Dinheiro e contagem, sem comissão. A comissão sai de `calculateSplit`, que
 * tem percentual por academia, taxa fixa, três estratégias de quem absorve a
 * tarifa do provedor e padrões vindos de variável de ambiente — o banco não lê
 * variável de ambiente, e duplicar essa regra em SQL criaria duas definições
 * da conta que paga as contas da empresa.
 *
 * Tipo puro, fora do data source, porque os dois lados o usam e os testes de
 * lógica pura precisam dele sem subir banco.
 */
export type ResumoDaAcademia = {
  organizationId: string
  alunosAtivos: number
  /** Cobranças pagas. É o GMV da academia. */
  recebido: number
  /** A vencer. */
  previsto: number
  atrasadoValor: number
  atrasadoQtd: number
}

export const RESUMO_VAZIO = (organizationId: string): ResumoDaAcademia => ({
  organizationId,
  alunosAtivos: 0,
  recebido: 0,
  previsto: 0,
  atrasadoValor: 0,
  atrasadoQtd: 0,
})

/**
 * Quantas academias o painel da plataforma totaliza numa leitura.
 *
 * Não é paginação: os **totais** precisam de uma linha por academia, porque a
 * taxa fixa do split é somada uma vez por academia e `split(soma)` não é a
 * soma dos splits. O teto existe para a leitura ter fim, e a tela **avisa**
 * quando ele é alcançado — teto anunciado é o oposto de resposta cortada em
 * silêncio, que é o defeito que isto fecha.
 *
 * Quinhentas academias é muito além do que a Synse tem; quando chegar perto, a
 * conversa é sobre o painel mostrar recorte por período, não sobre subir o
 * número.
 */
export const ACADEMIAS_NO_RESUMO = 500

/** Quantas academias a lista de `/synse-admin` mostra por página. */
export const ACADEMIAS_POR_PAGINA = 25

/**
 * Quantas academias o seletor de contexto oferece de uma vez.
 *
 * Ele é um menu, não uma lista: mostrar as mais recentes e dizer quantas
 * faltam é melhor que rolar trezentas — e muito melhor que cortar em silêncio,
 * que faria a conta de plataforma concluir que a academia não existe.
 */
export const ACADEMIAS_NO_SELETOR = 30
