/**
 * A aritmética da paginação, fora do componente.
 *
 * Mora aqui e não em `pagination.tsx` porque aquele arquivo é `'use client'`:
 * um módulo cliente só exporta componente, e valor importado dele por um
 * Server Component chega como referência de cliente em vez de valor.
 * Guardado por `tests/unit/constante-de-modulo-cliente.test.ts`.
 */

export type EstadoDaPaginacao =
  /** Uma página só, e estamos nela: não há o que mostrar. */
  | { tipo: 'oculta' }
  /** A página pedida não existe — lista encolheu, link velho, `?page=` na mão. */
  | { tipo: 'fora_da_faixa'; ultimaPagina: number }
  | { tipo: 'visivel'; de: number; ate: number; totalPaginas: number }

/**
 * O que a paginação deve mostrar para uma página pedida.
 *
 * O caso `fora_da_faixa` existe por um defeito concreto: a barra se escondia
 * quando havia uma página só, então quem chegasse em `?page=2` de uma lista
 * que encolheu via a seção **vazia e sem botão de voltar** — sem nem saber que
 * estava fora da lista. E o rótulo, se aparecesse, diria "25–9 de 9".
 */
export function estadoDaPaginacao(
  page: number,
  pageSize: number,
  total: number,
): EstadoDaPaginacao {
  const tamanho = Math.max(1, pageSize)
  const pagina = Math.max(1, page)
  const totalPaginas = Math.max(1, Math.ceil(Math.max(0, total) / tamanho))

  if (pagina > totalPaginas) return { tipo: 'fora_da_faixa', ultimaPagina: totalPaginas }
  if (totalPaginas <= 1) return { tipo: 'oculta' }

  return {
    tipo: 'visivel',
    de: (pagina - 1) * tamanho + 1,
    ate: Math.min(total, pagina * tamanho),
    totalPaginas,
  }
}
