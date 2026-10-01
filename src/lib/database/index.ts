import 'server-only'

import { cookies } from 'next/headers'

import { assinaturaDaPersonaNoCookie, DEMO_SESSION_COOKIE } from '@/lib/auth/demo-personas'
import { resumoDaAssinatura } from '@/lib/plans/subscription'
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

  /*
   * A demonstração não tem RLS, então ela precisa saber quem está vendo para
   * decidir entre entregar o conteúdo do Synse+ e mostrar a vitrine do
   * cadeado. Em produção esta conta não existe: quem decide é o banco.
   *
   * Lido aqui, e não dentro do data source, porque o módulo das personas
   * depende da semente e dos planos e de nada mais — `session.ts` importa
   * este arquivo, e importá-lo de volta fecharia um ciclo.
   */
  const cookieStore = await cookies()
  const assinatura = assinaturaDaPersonaNoCookie(cookieStore.get(DEMO_SESSION_COOKIE)?.value)

  return new DemoDataSource(await readDemoJournal(), {
    temPlus: resumoDaAssinatura(assinatura).ativa,
  })
}

export type { DataSource } from '@/lib/database/data-source'
