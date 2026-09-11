import { NextResponse } from 'next/server'

import { APP } from '@/config/app'
import { SUPABASE_URL, isDemoMode } from '@/lib/database/env'
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

/** Sonda de saúde. Não expõe segredo nem detalhe de infraestrutura. */
export async function GET() {
  const demo = isDemoMode()

  return NextResponse.json({
    status: 'ok',
    app: APP.name,
    version: APP.version,
    environment: APP.env,
    database: demo ? 'demo' : 'supabase',
    databaseRef: demo ? null : databaseRef(),
    paymentProvider: getPaymentProvider().id,
    timestamp: new Date().toISOString(),
  })
}
