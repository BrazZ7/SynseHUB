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
 * ── Chamar duas vezes não manda duas vezes ──────────────────────────────────
 *
 * Esta rota já disse o contrário, e a 0071 mudou isso. Quem entrega não é mais
 * uma leitura: `routine_reminders_due` **reivindica** — devolve o bloco e marca
 * `last_reminded_at` na mesma instrução, atomicamente. Chamar de novo na mesma
 * janela devolve vazio.
 *
 * É o que destrava o agendador gratuito. O GitHub Actions aceita cinco minutos
 * de intervalo e atrasa alguns, e com a 0070 isso não tinha saída: janela igual
 * ao intervalo deixava buracos (a execução das 10h15 que sai 10h25 não cobre
 * 10h00–10h10), e janela maior que o intervalo mandava "Hora de beber água"
 * três vezes. Agora a janela pode ser maior que o intervalo de propósito, que
 * é o que absorve o atraso.
 *
 * ── A conta da janela ───────────────────────────────────────────────────────
 *
 * Chamada de 5 em 5 minutos com janela de 15, um bloco é visto por até três
 * execuções e entregue na primeira que o alcançar: cabem 10 minutos de atraso
 * do agendador sem perder nada.
 *
 * **Agendador mais de 15 minutos atrasado perde aquele lembrete**, e isso é
 * escolha: "beber água" chegando uma hora depois não é lembrete, é ruído. Quem
 * quiser outra régua muda por `?minutos=`, até 60 — o teto de 60 está no banco
 * e não aqui, porque é ele que garante que a ocorrência de ontem e a de hoje
 * nunca caiam na mesma janela.
 *
 * ── Quem dispara ────────────────────────────────────────────────────────────
 *
 * `.github/workflows/lembretes.yml`, de 5 em 5 minutos — gratuito, e no mesmo
 * lugar onde o código já está. Serve qualquer agendador que saiba fazer um GET
 * com cabeçalho: Vercel Cron no plano pago, ou um serviço de cron externo.
 *
 * **Não está em `vercel.json` de propósito**: o plano Hobby recusa agendamento
 * mais frequente que diário, e uma expressão de cinco em cinco minutos ali
 * faria o deploy inteiro falhar — a tela do plano cairia junto com o resto do
 * app por causa de um agendamento que o plano não aceita.
 */

/**
 * O teto de avisos por chamada, para uma janela torta não virar enxurrada.
 *
 * Vai **para dentro** da consulta, e isso não é detalhe de estilo: a rota
 * cortava em memória, com `slice`, e desde que a função reivindica isso viraria
 * perda silenciosa — o aviso 501 sairia marcado como entregue sem ninguém
 * entregar, e não voltaria nunca. O que não cabe no teto não é reivindicado e
 * aparece na execução seguinte.
 */
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
     * A única função do projeto que atravessa pessoas, e a única que escreve
     * sem ser em nome de quem chamou. Ela é revogada de `authenticated`: a
     * chave de serviço é a única porta, e esta rota é o único lugar que a usa.
     *
     * Chamá-la **é** entregar: o que ela devolve já saiu marcado. Se o push
     * falhar daqui para baixo, aquele aviso é perdido em vez de repetido — a
     * ordem contrária (entregar e marcar depois) devolveria a corrida entre
     * duas execuções do agendador, que é o problema que a 0071 fechou.
     */
    const { data, error } = await admin.rpc('routine_reminders_due', {
      p_minutos: minutos,
      p_teto: TETO,
    })
    if (error) throw new Error(error.message)

    /*
     * "Reivindicados", e não "vencendo": estes blocos já saíram marcados como
     * avisados. O nome importa para quem ler o log depois — a diferença entre
     * os dois números abaixo é aviso perdido, não aviso pendente.
     */
    const reivindicados = (data ?? []) as Linha[]
    let entregues = 0

    for (const linha of reivindicados) {
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
      reivindicados: reivindicados.length,
      entregues,
      minutos,
    })
    return NextResponse.json({
      ok: true,
      reivindicados: reivindicados.length,
      entregues,
      minutos,
    })
  } catch (error) {
    logger.error('cron:lembretes_falhou', { error: String(error) })
    return NextResponse.json({ ok: false, error: 'falha ao enviar os lembretes' }, { status: 500 })
  }
}
