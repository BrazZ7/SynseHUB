import 'server-only'

import { DemoDataSource } from '@/lib/database/demo-data-source'
import { readDemoJournal } from '@/lib/database/demo-journal'
import { SupabaseDataSource } from '@/lib/database/supabase-data-source'
import { createSupabaseServerClient } from '@/lib/database/supabase-server'
import type { DataSource } from '@/lib/database/data-source'

/**
 * Resolve o data source da requisição.
 *
 * Com Supabase configurado, cada requisição recebe um cliente ligado à sessão
 * do usuário — e portanto sujeito à RLS.
 *
 * Sem Supabase, cai no dataset de demonstração. Aqui não há singleton de
 * propósito: o data source é montado por requisição a partir do dataset base
 * mais o diário do visitante, que vem no cookie. É o que faz a demonstração
 * sobreviver a um ambiente serverless, onde requisições seguidas caem em
 * execuções diferentes, e o que isola a demonstração de cada visitante.
 */
export async function getDataSource(): Promise<DataSource> {
  const supabase = await createSupabaseServerClient()
  if (supabase) return new SupabaseDataSource(supabase)

  return new DemoDataSource(await readDemoJournal())
}

export type { DataSource } from '@/lib/database/data-source'
