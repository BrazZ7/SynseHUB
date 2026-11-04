import { NextResponse } from 'next/server'

import { avisoDoBloco } from '@/features/plano/state'
import { createSupabaseAdminClient } from '@/lib/database/supabase-admin'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { enviarAviso } from '@/lib/push/send'
import { bearerAutorizado } from '@/lib/secrets'
import type { RoutineKind } from '@/types/domain'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * ── Os lembretes do plano ───────────────────────────────────────────────────
 *
 * A pessoa diz "às 10h, beber água"; esta rotina é quem entrega o aviso.
 *
 * ── A janela, e por que ela é o parâmetro ───────────────────────────────────
 *
 * Nenhum agendador acorda no segundo exato, e a maioria dos gratuitos atrasa
 * minutos. Em vez de procurar "o que vence agora", a rotina pergunta "o que
 * venceu nos últimos N minutos" — e N tem de **casar com a frequência de quem
 * chama**. Chamada a cada 15 minutos com janela de 15, todo bloco é visto uma
 * vez; com janela maior, visto duas; com janela menor, alguns ficam de fora.
 *
 * O padrão é 15, e quem chama pode mudar por `?minutos=`.
 *
 * ── Chamar duas vezes manda duas vezes ──────────────────────────────────────
 *
 * E isso está escrito de propósito, em vez de disfarçado. Guardar o que já foi
 * mandado exigiria uma tabela de entregas que cresce para sempre para resolver
 * um problema que a janela certa já resolve. Quem chamar fora de hora manda de
 * novo — e é por isso que o segredo existe.
 *
 * ── Quem dispara ────────────────────────────────────────────────────────────
 *
 * Qualquer agendador que saiba fazer um GET com cabeçalho. Vercel Cron no
 * plano pago, GitHub Actions (gratuito, mínimo de 5 minutos), ou qualquer
 * serviço de cron.
 *
 * **Não está em `vercel.json` de propósito**: o plano Hobby recusa agendamento
 * mais frequente que diário, e uma expressão de quinze em quinze minutos ali
 * faria o deploy inteiro falhar — a tela do plano cairia junto com o resto do
 * app por causa de um agendamento que o plano não aceita.
 */

/** O teto de avisos por chamada, para uma janela torta não virar enxurrada. */
const TETO = 500

type Linha = {
  block_id: string
  user_profile_id: string
  kind: RoutineKind
  title: string | null
  at_time: string
}

export async function GET(request: Request) {
  const segredo = env(process.env.CRON_SECRET, '')

  if (!bearerAutorizado(request.headers.get('authorization'), segredo)) {
    logger.warn('cron:lembretes_unauthorized')
    // 404, como nas outras: para quem não deveria estar aqui, não existe.
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  const pedido = Number.parseInt(new URL(request.url).searchParams.get('minutos') ?? '15', 10)
  const minutos = Math.min(60, Math.max(1, Number.isFinite(pedido) ? pedido : 15))

  const admin = createSupabaseAdminClient()
  if (!admin) {
    logger.warn('cron:lembretes_sem_service_role')
    return NextResponse.json({ ok: false, error: 'sem chave de serviço' }, { status: 503 })
  }

  try {
    /*
     * `routine_reminders_due` é a única leitura do projeto que atravessa
     * pessoas, e ela é revogada de `authenticated`: a chave de serviço é a
     * única porta, e esta rota é o único lugar que a usa.
     */
    const { data, error } = await admin.rpc('routine_reminders_due', { p_minutos: minutos })
    if (error) throw new Error(error.message)

    const vencendo = ((data ?? []) as Linha[]).slice(0, TETO)
    let entregues = 0

    for (const linha of vencendo) {
      const saiu = await enviarAviso(linha.user_profile_id, {
        titulo: avisoDoBloco({ kind: linha.kind, title: linha.title }),
        corpo: 'Do seu plano.',
        url: '/app/plano',
        /*
         * Uma tag por bloco: se a pessoa não viu o aviso das 10h e o das 15h
         * chega, o segundo substitui o primeiro em vez de empilhar dois
         * "beber água" na tela bloqueada.
         */
        tag: `plano-${linha.block_id}`,
      })
      if (saiu > 0) entregues += 1
    }

    /*
     * O log não leva o que a pessoa escreveu nem para quem foi — só os
     * números. A 0070 decidiu que a rotina de alguém não sai da conta dela, e
     * um log com "Beber água · perfil X" seria a mesma informação saindo por
     * outra porta.
     */
    logger.info('cron:lembretes_enviados', {
      vencendo: vencendo.length,
      entregues,
      minutos,
    })
    return NextResponse.json({ ok: true, vencendo: vencendo.length, entregues, minutos })
  } catch (error) {
    logger.error('cron:lembretes_falhou', { error: String(error) })
    return NextResponse.json({ ok: false, error: 'falha ao enviar os lembretes' }, { status: 500 })
  }
}
