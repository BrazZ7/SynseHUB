import 'server-only'

import { createClient } from '@supabase/supabase-js'

import { SUPABASE_URL, isSupabaseConfigured } from '@/lib/database/env'
import { env } from '@/lib/env'

/**
 * Cliente com service role — ignora RLS.
 *
 * Uso restrito a: processamento de webhook, jobs de cobrança e painel
 * SUPER_ADMIN. Nunca importar em código que chega ao cliente.
 */
export function createSupabaseAdminClient() {
  const serviceRoleKey = env(process.env.SUPABASE_SERVICE_ROLE_KEY, '')
  if (!isSupabaseConfigured() || !serviceRoleKey) return null

  return createClient(SUPABASE_URL, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
