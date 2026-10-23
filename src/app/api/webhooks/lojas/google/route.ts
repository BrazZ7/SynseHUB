import { NextResponse } from 'next/server'

import { processarNotificacaoDaLoja } from '@/features/plus/loja/notificacao-service'
import { logger } from '@/lib/logger'
import { estadoDoGoogle } from '@/lib/plans/lojas/estado'
import { consultarAssinaturaDoGoogle } from '@/lib/plans/lojas/google-api'
import {
  ehTesteDoGoogle,
  lerNotificacaoDoGoogle,
  TIPOS_DO_GOOGLE,
} from '@/lib/plans/lojas/google-notificacao'
import { APP_ID } from '@/lib/plans/lojas/tipos'
import { bearerAutorizado } from '@/lib/secrets'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Notificações em tempo real do Google Play (RTDN, via Pub/Sub).
 *
 * ── Por que aqui há token e no da Apple não ─────────────────────────────────
 *
 * A notificação da Apple é uma JWS: a assinatura é a autenticação. Esta não
 * tem assinatura nenhuma — qualquer pessoa que descubra o endereço consegue
 * postar JSON.
 *
 * O token confere **quem** chamou. O que mantém a assinatura correta é outra
 * coisa, e é a mais importante das duas: **o corpo não decide nada.** Dele sai
 * um `purchaseToken`, e o estado vem de uma consulta nossa à Play Developer
 * API. Uma notificação forjada, no máximo, nos faz perguntar ao Google sobre um
 * token — e a resposta dele é que vale.
 *
 * O token é configurado no Pub/Sub como cabeçalho da assinatura de push.
 * Sem `GOOGLE_RTDN_SECRET` definido, **tudo é recusado** — e não o contrário:
 * aceitar por omissão transformaria um esquecimento de variável de ambiente
 * numa porta aberta, e nada na tela denunciaria isso.
 */
export async function POST(request: Request) {
  const esperado = process.env.GOOGLE_RTDN_SECRET ?? ''
  if (!bearerAutorizado(request.headers.get('authorization'), esperado)) {
    return NextResponse.json({ received: false }, { status: 401 })
  }

  const corpo = await request.json().catch(() => null)

  /*
   * O botão "enviar notificação de teste" da Play Console manda um envelope com
   * `testNotification` e sem assinatura nenhuma. Responder 200 é o que ele
   * espera, e não há estado para mexer.
   */
  if (ehTesteDoGoogle(corpo)) {
    logger.info('loja:google_notificacao_de_teste', {})
    return NextResponse.json({ received: true, outcome: 'TEST' }, { status: 200 })
  }

  let notificacao
  try {
    notificacao = lerNotificacaoDoGoogle(corpo)
  } catch (erro) {
    /*
     * Envelope que não é de assinatura — compra única, compra anulada — cai
     * aqui. 200 de propósito: o Pub/Sub reentrega o que não recebe 2xx, e
     * reentregar algo que nunca vamos processar é um laço eterno.
     */
    logger.info('loja:google_notificacao_ignorada', { erro: String(erro).slice(0, 200) })
    return NextResponse.json({ received: true, outcome: 'IGNORED' }, { status: 200 })
  }

  if (notificacao.pacote !== APP_ID) {
    logger.error('loja:google_notificacao_de_outro_app', { pacote: notificacao.pacote })
    return NextResponse.json({ received: true, outcome: 'IGNORED' }, { status: 200 })
  }

  let estado
  try {
    const assinatura = await consultarAssinaturaDoGoogle(notificacao.purchaseToken, {
      pacote: APP_ID,
    })
    estado = estadoDoGoogle(assinatura, { purchaseToken: notificacao.purchaseToken })
  } catch (erro) {
    const nome = erro instanceof Error ? erro.name : ''
    if (nome === 'CompraInexistente') {
      /*
       * O Google não conhece o token. Notificação forjada, ou compra já
       * recolhida: nada a fazer, e 200 para o Pub/Sub parar de reentregar.
       */
      logger.error('loja:google_notificacao_sem_compra', { tipo: notificacao.tipo })
      return NextResponse.json({ received: true, outcome: 'IGNORED' }, { status: 200 })
    }
    /*
     * API fora ou sem credencial. **500 de propósito**, ao contrário de todo o
     * resto: aqui a reentrega do Pub/Sub é exatamente o que se quer — ela tenta
     * de novo com recuo, e a assinatura fica correta quando o Google voltar.
     * Responder 200 jogaria o evento no lixo.
     */
    logger.error('loja:google_notificacao_indisponivel', { erro: String(erro).slice(0, 200) })
    return NextResponse.json({ received: false }, { status: 500 })
  }

  /*
   * O horário do evento vem da **notificação**, não da consulta: a resposta da
   * API não diz quando o Google mudou a assinatura, e é esse horário que a
   * regra 1 da 0061 usa para descartar reentrega fora de ordem.
   */
  const desfecho = await processarNotificacaoDaLoja({
    loja: 'google',
    /*
     * O `messageId` do Pub/Sub é único por mensagem, mas a **mesma** mensagem
     * reentregue mantém o id — que é justamente o que a idempotência precisa.
     */
    eventId: notificacao.messageId || `${notificacao.purchaseToken}:${notificacao.eventoEm}`,
    tipo: TIPOS_DO_GOOGLE[notificacao.tipo] ?? `TIPO_${notificacao.tipo}`,
    estado: { ...estado, eventoEm: notificacao.eventoEm ?? estado.eventoEm },
    rawPayload: {
      packageName: notificacao.pacote,
      notificationType: notificacao.tipo,
      subscriptionId: notificacao.produto,
      eventTimeMillis: notificacao.eventoEm,
      messageId: notificacao.messageId,
    },
  })

  return NextResponse.json({ received: true, outcome: desfecho }, { status: 200 })
}
