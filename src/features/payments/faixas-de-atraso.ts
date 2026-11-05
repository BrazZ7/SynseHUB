/**
 * ── As faixas de atraso ─────────────────────────────────────────────────────
 *
 * Um lugar só para dizer onde uma cobrança vencida cai: 1 a 5 dias, 6 a 15,
 * 16 a 30, mais de 30.
 *
 * Mora fora de `service.ts` porque aquele arquivo é `server-only`, e estes
 * limites precisam ser lidos por três lados que não são a tela: o data source
 * (que traduz a faixa em janela de datas para o Postgres filtrar), a função
 * `resumo_de_inadimplencia` da 0051 (que recebe os cortes como argumento, em
 * vez de repeti-los em SQL) e os testes de banco. Repetir `5, 15, 30` em
 * qualquer um desses lugares criaria duas definições da mesma régua, e a
 * segunda envelheceria em silêncio: a tela diria "7 dias" numa linha que a
 * contagem pôs na faixa de 1 a 5.
 */

export type OverdueBucket = '1-5' | '6-15' | '16-30' | '30+'

/**
 * Onde cada faixa termina, em dias de atraso.
 *
 * A última faixa é aberta — não tem corte —, e é por isso que a lista tem três
 * números para quatro faixas. A função do banco recebe exatamente este array.
 */
export const CORTES_DAS_FAIXAS = [5, 15, 30] as const

/**
 * As faixas na ordem em que a tela as mostra, e na ordem dos cortes.
 *
 * O índice aqui é o que a função do banco devolve em `faixa`, somado de um:
 * `faixa = 1` é a primeira, `faixa = 0` é o total. Ver `faixaDoIndice`.
 */
export const FAIXAS: readonly OverdueBucket[] = ['1-5', '6-15', '16-30', '30+']

export const OVERDUE_BUCKETS: Array<{ value: OverdueBucket | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'Todos' },
  { value: '1-5', label: '1 a 5 dias' },
  { value: '6-15', label: '6 a 15 dias' },
  { value: '16-30', label: '16 a 30 dias' },
  { value: '30+', label: 'Mais de 30 dias' },
]

/** A faixa de um número de dias de atraso. Zero e negativo caem na primeira. */
export function faixaDeDias(dias: number): OverdueBucket {
  const corte = CORTES_DAS_FAIXAS.findIndex((limite) => dias <= limite)
  return FAIXAS[corte === -1 ? FAIXAS.length - 1 : corte]
}

/** O que a coluna `faixa` da função do banco quer dizer. `0` é o total. */
export function faixaDoIndice(indice: number): OverdueBucket | null {
  return indice >= 1 && indice <= FAIXAS.length ? FAIXAS[indice - 1] : null
}

/** Uma data em `YYYY-MM-DD`, pelos componentes locais — como `daysBetween` lê. */
export function comoData(data: Date): string {
  const mes = String(data.getMonth() + 1).padStart(2, '0')
  const dia = String(data.getDate()).padStart(2, '0')
  return `${data.getFullYear()}-${mes}-${dia}`
}

/**
 * A janela de vencimentos de uma faixa, para o Postgres filtrar.
 *
 * Dias de atraso é `hoje - vencimento`, então mais atraso é vencimento mais
 * **antigo**: o fim da faixa em dias vira o começo dela em datas, e vice-versa.
 * Inverter os dois é o erro natural aqui, e o teste cobre os dois lados.
 *
 * As duas pontas abertas não são simetria boba:
 *
 *   a primeira faixa não tem `ate` porque o atraso é contado com piso em zero
 *     — uma cobrança marcada como vencida com data futura tem zero dia de
 *     atraso e pertence a ela, e um limite superior em datas a excluiria;
 *   a última não tem `de` porque é a faixa aberta.
 */
export function janelaDaFaixa(
  faixa: OverdueBucket,
  hoje: Date,
): { de: string | null; ate: string | null } {
  const indice = FAIXAS.indexOf(faixa)
  if (indice === -1) return { de: null, ate: null }

  const maxDias = indice < CORTES_DAS_FAIXAS.length ? CORTES_DAS_FAIXAS[indice] : null
  const minDias = indice === 0 ? null : CORTES_DAS_FAIXAS[indice - 1] + 1

  return {
    de: maxDias === null ? null : comoData(menosDias(hoje, maxDias)),
    ate: minDias === null ? null : comoData(menosDias(hoje, minDias)),
  }
}

function menosDias(data: Date, dias: number): Date {
  const outra = new Date(data.getFullYear(), data.getMonth(), data.getDate())
  outra.setDate(outra.getDate() - dias)
  return outra
}
