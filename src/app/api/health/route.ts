import { NextResponse } from 'next/server'

import { APP } from '@/config/app'
import { isDemoMode } from '@/lib/database/env'
import { getPaymentProvider } from '@/lib/payments'

export const dynamic = 'force-dynamic'

/** Sonda de saúde. Não expõe segredo nem detalhe de infraestrutura. */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    app: APP.name,
    version: APP.version,
    environment: APP.env,
    database: isDemoMode() ? 'demo' : 'supabase',
    paymentProvider: getPaymentProvider().id,
    timestamp: new Date().toISOString(),
  })
}
