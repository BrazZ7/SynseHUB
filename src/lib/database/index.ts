import 'server-only'

import { DemoDataSource } from '@/lib/database/demo-data-source'
import { SupabaseDataSource } from '@/lib/database/supabase-data-source'
import { createSupabaseServerClient } from '@/lib/database/supabase-server'
import type { DataSource } from '@/lib/database/data-source'

let demoSingleton: DemoDataSource | null = null

/**
 * Resolve o data source da requisição.
 *
 * Com Supabase configurado, cada requisição recebe um cliente ligado à sessão
 * do usuário — e portanto sujeito à RLS. Sem Supabase, cai no dataset de
 * demonstração, que é um singleton para preservar as mutações da sessão.
 */
export async function getDataSource(): Promise<DataSource> {
  const supabase = await createSupabaseServerClient()
  if (supabase) return new SupabaseDataSource(supabase)

  if (!demoSingleton) demoSingleton = new DemoDataSource()
  return demoSingleton
}

export type { DataSource } from '@/lib/database/data-source'
