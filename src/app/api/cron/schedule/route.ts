import { NextResponse } from 'next/server'

import { getDataSource } from '@/lib/database'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { bearerAutorizado } from '@/lib/secrets'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Três semanas à frente: a janela que a grade do painel e o app mostram. */
const DIAS_A_FRENTE = 21

/**
 * Materialização diária da grade, como reforço.
 *
 * Não é o que sustenta a agenda: quem repõe o horizonte é a própria leitura das
 * telas, por `ensure_org_class_sessions`. Amarrar a agenda a um agendamento
 * externo a deixaria refém de um plano pago e de um serviço capaz de falhar
 * calado — e o sintoma seria a academia abrindo o painel sem futuro.
 *
 * O valor desta rotina é outro: a academia que passa dias sem ninguém abrir a
 * agenda chega de manhã com a grade pronta, e quem consulta pelo app do aluno
 * não espera a primeira escrita.
 *
 * É seguro chamar duas vezes: o `unique (schedule_id, starts_at)` da 0024 é
 * quem garante uma aula por horário, não a contagem de chamadas.
 */
export async function GET(request: Request) {
  const segredo = env(process.env.CRON_SECRET, '')

  if (!bearerAutorizado(request.headers.get('authorization'), segredo)) {
    logger.warn('cron:schedule_unauthorized')
    // 404, como na cobrança: para quem não deveria estar aqui, não existe.
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  try {
    const dataSource = await getDataSource()
    const criadas = await dataSource.generateAllClassSessions(DIAS_A_FRENTE)

    logger.info('cron:schedule_generated', { criadas, diasAFrente: DIAS_A_FRENTE })
    return NextResponse.json({ ok: true, criadas, diasAFrente: DIAS_A_FRENTE })
  } catch (error) {
    logger.error('cron:schedule_failed', { error: String(error) })
    return NextResponse.json({ ok: false, error: 'falha ao gerar as aulas' }, { status: 500 })
  }
}
