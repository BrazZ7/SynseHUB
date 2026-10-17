import 'server-only'

import { headers } from 'next/headers'

import { ehAppNativo } from '@/lib/plataforma/app-nativo'

/**
 * Está sendo aberto de dentro do app?
 *
 * Separado da função pura porque `next/headers` só existe no servidor, e
 * importar isto de um componente de cliente quebra a build — a leitura do
 * cabeçalho mora aqui para que `ehAppNativo` possa ser testada sem requisição.
 *
 * ── Ler cabeçalho torna a rota dinâmica, e isso é necessário ────────────────
 *
 * Qualquer página que decida algo por aqui **não pode** ser renderizada
 * estaticamente: uma página em cache com o botão de compra seria entregue para
 * dentro do app, que é exatamente o que não pode acontecer. O `headers()` do
 * Next marca a rota como dinâmica por consequência, e é por isso que a leitura
 * passa por ele em vez de por um valor recebido de fora.
 */
export async function noAppNativo(): Promise<boolean> {
  const lidos = await headers()
  return ehAppNativo(lidos.get('user-agent'))
}
