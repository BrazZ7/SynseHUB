import { NextResponse } from 'next/server'

import { readErrorsFor } from '@/lib/observability/recent-errors'
import { createSupabaseServerClient } from '@/lib/database/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * O outro lado da referência que a tela de erro mostra.
 *
 * Só devolve os erros das requisições de quem está lendo — um erro pode
 * carregar dado de quem o provocou, e ninguém precisa do erro do vizinho para
 * depurar o próprio. Os demais aparecem só como contagem.
 *
 * A lista vive na memória da instância: some no reinício e não atravessa as
 * instâncias serverless. Abrir logo depois de ver o erro é o que dá a maior
 * chance de cair na mesma.
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

  const { meus, deOutros } = readErrorsFor(user.id)

  return NextResponse.json({
    authenticated: true,
    erros: meus,
    deOutrasContas: deOutros,
    aviso:
      meus.length === 0
        ? 'Nenhum erro registrado nesta instância para a sua conta. Provoque o erro de novo e recarregue esta página em seguida.'
        : undefined,
    timestamp: new Date().toISOString(),
  })
}
