import { NextResponse } from 'next/server'

import { readErrorsFor, readPersistedErrors } from '@/lib/observability/recent-errors'
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
  const gravados = await readPersistedErrors(user.id)

  // A memória primeiro (é a desta instância, e mais recente); o banco em
  // seguida, sem repetir o que já veio.
  const vistos = new Set(meus.map((item) => `${item.at}|${item.message}`))
  const erros = [
    ...meus,
    ...gravados.meus.filter((item) => !vistos.has(`${item.at}|${item.message}`)),
  ]

  return NextResponse.json({
    authenticated: true,
    erros,
    naMemoriaDestaInstancia: meus.length,
    gravadosNoBanco: gravados.meus.length,
    semDonoNoBanco: gravados.semDono,
    deOutrasContasNestaInstancia: deOutros,
    aviso:
      erros.length === 0
        ? 'Nenhum erro registrado. Provoque o erro de novo e recarregue esta página.'
        : undefined,
    timestamp: new Date().toISOString(),
  })
}
