import { NextResponse } from 'next/server'

import { APP } from '@/config/app'
import { SUPABASE_ANON_KEY, SUPABASE_URL, isDemoMode } from '@/lib/database/env'
import { getPaymentProvider } from '@/lib/payments'

export const dynamic = 'force-dynamic'

/**
 * Início do identificador do projeto Supabase — o suficiente para conferir que
 * o que está no ar aponta para o banco certo, e curto demais para servir de
 * endereço. "Está em produção o mesmo projeto que eu populei?" é uma pergunta
 * que já custou horas de investigação no lugar errado.
 */
function databaseRef(): string | null {
  const host = URL.canParse(SUPABASE_URL) ? new URL(SUPABASE_URL).hostname : ''
  const ref = host.split('.')[0]
  return ref ? `${ref.slice(0, 8)}…` : null
}

/**
 * Formato da chave pública, sem revelar a chave.
 *
 * `NEXT_PUBLIC_*` é embutida no código durante o build, então a que está em uso
 * pode ser mais velha que a que está no painel. O prefixo distingue as três
 * confusões que acontecem de verdade — chave publicável (`sb_publishable_`),
 * chave secreta colada no lugar errado (`sb_secret_`) e JWT antiga (`eyJ…`) —
 * e o tamanho denuncia um valor cortado na colagem ou com aspas em volta.
 */
function databaseKey(): { prefix: string; length: number } | null {
  if (!SUPABASE_ANON_KEY) return null
  return { prefix: `${SUPABASE_ANON_KEY.slice(0, 15)}…`, length: SUPABASE_ANON_KEY.length }
}

/**
 * Pergunta ao Supabase se ele aceita a chave desta build.
 *
 * Sem isto, uma chave recusada chega ao usuário como "e-mail ou senha
 * incorretos" e manda todo mundo procurar a senha. Fica atrás de `?deep=1`
 * porque é uma chamada de rede: a sonda comum precisa continuar barata.
 */
async function databaseReachable(): Promise<{ ok: boolean; status: number | null }> {
  try {
    const resposta = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: SUPABASE_ANON_KEY },
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    })
    return { ok: resposta.ok, status: resposta.status }
  } catch {
    return { ok: false, status: null }
  }
}

/** Sonda de saúde. Não expõe segredo nem detalhe de infraestrutura. */
export async function GET(request: Request) {
  const demo = isDemoMode()
  const deep = new URL(request.url).searchParams.get('deep') === '1'

  return NextResponse.json({
    status: 'ok',
    app: APP.name,
    version: APP.version,
    environment: APP.env,
    appUrl: APP.url,
    database: demo ? 'demo' : 'supabase',
    databaseRef: demo ? null : databaseRef(),
    databaseKey: demo ? null : databaseKey(),
    ...(deep && !demo ? { databaseAuth: await databaseReachable() } : {}),
    paymentProvider: getPaymentProvider().id,
    timestamp: new Date().toISOString(),
  })
}
