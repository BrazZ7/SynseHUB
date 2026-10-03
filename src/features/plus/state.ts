/**
 * Estado da adesão ao Synse+.
 *
 * Mora fora do arquivo `'use server'` porque lá só pode haver função
 * assíncrona exportada — regra guardada por `tests/unit/use-server-exports.test.ts`.
 */
export type AdesaoState = {
  status: 'idle' | 'error'
  message?: string
}

export const adesaoInicial: AdesaoState = { status: 'idle' }
