import { NextResponse } from 'next/server'

import { resolveSession } from '@/lib/auth/session'
import { createSupabaseServerClient } from '@/lib/database/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * Por que a minha conta não abre o painel?
 *
 * Sonda de uma pergunta só, respondida sobre **a conta de quem chama** — as
 * consultas usam o cliente da própria sessão, então a RLS continua no caminho
 * e ninguém enxerga a conta de outra pessoa por aqui.
 *
 * Existe porque diagnosticar isso custou duas rodadas de tentativa e erro: o
 * sintoma que chega ("pede para escolher se sou academia") é o mesmo para
 * causas diferentes — ficha ausente, vínculo ausente, schema atrasado, RLS
 * negando. A resposta abaixo separa as quatro, e pode ser aberta no navegador
 * por quem está logado, sem terminal e sem chave nenhuma.
 *
 * Só devolve booleano, contagem e código de erro. Nome, e-mail e id inteiro
 * ficam de fora: para achar o problema, bastam a forma e o código.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient()

  if (!supabase) {
    return NextResponse.json({ authenticated: false, reason: 'sem-supabase' }, { status: 503 })
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json(
      { authenticated: false, hint: 'Faça login e abra esta página de novo.' },
      { status: 401 },
    )
  }

  const comTier = await supabase
    .from('user_profiles')
    .select('id, tier')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  const semTier = await supabase
    .from('user_profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  const profileId = (semTier.data?.id ?? comTier.data?.id) as string | undefined

  const vinculo = profileId
    ? await supabase
        .from('organization_members')
        .select('role, status')
        .eq('user_profile_id', profileId)
    : null

  const matriculas = profileId
    ? await supabase
        .from('students')
        .select('status, organization_id')
        .eq('user_profile_id', profileId)
    : null

  const resolucao = await resolveSession()

  return NextResponse.json({
    authenticated: true,
    authUserId: `${user.id.slice(0, 8)}…`,
    emailConfirmed: Boolean(user.email_confirmed_at),
    profile: {
      // Qual das duas leituras funciona diz se a migration 0014 já subiu.
      comTier: { encontrado: Boolean(comTier.data), erro: comTier.error?.code ?? null },
      semTier: { encontrado: Boolean(semTier.data), erro: semTier.error?.code ?? null },
    },
    membros: {
      total: vinculo?.data?.length ?? 0,
      papeis: vinculo?.data?.map((row) => `${row.role}:${row.status}`) ?? [],
      erro: vinculo?.error?.code ?? null,
    },
    matriculas: {
      total: matriculas?.data?.length ?? 0,
      situacoes: matriculas?.data?.map((row) => row.status) ?? [],
      erro: matriculas?.error?.code ?? null,
    },
    resolucao:
      resolucao.status === 'ok'
        ? { status: 'ok', papel: resolucao.session.role, plano: resolucao.session.tier }
        : resolucao,
    timestamp: new Date().toISOString(),
  })
}
