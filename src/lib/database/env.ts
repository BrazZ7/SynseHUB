import { env } from '@/lib/env'

/**
 * Detecção de ambiente de dados.
 *
 * Sem credenciais de Supabase o SynseHub sobe em DEMO MODE: um data source em
 * memória, com dados coerentes de uma academia real. Isso mantém a aplicação
 * inteira navegável e testável antes de existir infraestrutura — e o contrato
 * é exatamente o mesmo do data source de produção.
 */

export const SUPABASE_URL = env(process.env.NEXT_PUBLIC_SUPABASE_URL, '')
export const SUPABASE_ANON_KEY = env(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, '')

export function isSupabaseConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0
}

export function isDemoMode(): boolean {
  return !isSupabaseConfigured()
}
