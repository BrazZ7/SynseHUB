import { NextResponse } from 'next/server'

import { runBillingJob } from '@/features/payments/billing-job'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { bearerAutorizado } from '@/lib/secrets'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Rotina diária de cobrança.
 *
 * Chamada pelo agendamento da Vercel, que envia `Authorization: Bearer` com o
 * valor de `CRON_SECRET`. Sem segredo configurado, tudo é recusado — aceitar
 * por omissão transformaria um esquecimento de variável de ambiente num
 * endereço público capaz de gerar cobrança para toda a base.
 *
 * É seguro chamar duas vezes: a unicidade de `billing_reference` no banco é
 * quem garante uma mensalidade por ciclo, não a contagem de chamadas.
 */
export async function GET(request: Request) {
  const segredo = env(process.env.CRON_SECRET, '')

  if (!bearerAutorizado(request.headers.get('authorization'), segredo)) {
    logger.warn('cron:billing_unauthorized')
    // 404 em vez de 401: para quem não deveria estar aqui, o endereço não
    // existe. Um 401 confirma que existe e convida a insistir.
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  const resultado = await runBillingJob()

  return NextResponse.json(resultado, { status: resultado.ok ? 200 : 500 })
}
