import { NextResponse } from 'next/server'

import { verificarCompraDaLoja } from '@/features/plus/loja/verificar-service'
import { requireStudentSession } from '@/lib/auth/require-session'
import { createSupabaseAdminClient } from '@/lib/database/supabase-admin'
import { isDemoMode } from '@/lib/database/env'
import { logger } from '@/lib/logger'
import { ambientesDaApple, raizDaApple } from '@/lib/plans/lojas/apple-config'
import { APP_ID, PRODUTO_MENSAL, type Loja } from '@/lib/plans/lojas/tipos'
import { pruneRateLimits, rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * ── A compra feita na loja, trazida para a conta ─────────────────────────────
 *
 * O plugin nativo abre a folha de compra e devolve um comprovante. Esta rota é
 * quem transforma isso em assinatura: verifica com a loja, e grava pela porta
 * única da 0061.
 *
 * ── Por que `p_takeover: true` aqui, e só aqui ───────────────────────────────
 *
 * Este é **o caminho da compra**, e a regra 3 da 0061 existe para ele: quem
 * acabou de ser cobrado pela App Store recebe o acesso mesmo que haja
 * assinatura viva de outra origem. Negar depois do débito seria tirar dinheiro
 * de alguém e não entregar nada — e das duas assinaturas, a da loja é
 * justamente a que o Synse não consegue cancelar.
 *
 * A duplicidade fica registrada em `plus_subscription_conflicts`, que é o que
 * alguém precisa olhar para estornar a outra.
 *
 * ── O que a resposta diz, e por quê ──────────────────────────────────────────
 *
 * `confirmar` só pode ser chamado pelo app **depois** desta rota ter gravado:
 * reconhecer a compra na loja antes é dizer "entreguei" sem ter entregue, e aí
 * uma falha aqui deixaria a pessoa paga, sem acesso e sem estorno automático.
 *
 * Então a resposta carrega `confirmar: true` apenas no sucesso. É o sinal, e
 * não uma sugestão.
 */

const LOJAS: readonly Loja[] = ['apple', 'google']

export async function POST(request: Request) {
  const session = await requireStudentSession()

  pruneRateLimits()
  /*
   * Cinco por minuto por perfil. Cada chamada pode custar duas viagens à API
   * do Google, e uma tela em laço não pode virar um ataque ao nosso próprio
   * limite de cota — nem ao da loja.
   */
  if (!(await rateLimit(`plus:loja:${session.userProfileId}`, 5, 60_000)).allowed) {
    return NextResponse.json({ ok: false, motivo: 'tentativas' }, { status: 429 })
  }

  const corpo = (await request.json().catch(() => null)) as
    | { loja?: unknown; comprovante?: unknown }
    | null

  const loja = corpo?.loja
  const comprovante = corpo?.comprovante
  if (typeof loja !== 'string' || !LOJAS.includes(loja as Loja)) {
    return NextResponse.json({ ok: false, motivo: 'loja' }, { status: 400 })
  }
  if (typeof comprovante !== 'string' || comprovante.length === 0 || comprovante.length > 20_000) {
    /*
     * O teto existe porque a JWS da Apple é grande mas não é ilimitada, e um
     * corpo de megabytes custaria memória antes de qualquer verificação.
     */
    return NextResponse.json({ ok: false, motivo: 'comprovante' }, { status: 400 })
  }

  const admin = createSupabaseAdminClient()
  if (!admin || isDemoMode()) {
    /*
     * Sem banco não há o que gravar, e a demonstração não vende nada. Recusar
     * é melhor que responder sucesso: a tela chamaria `confirmar`, e a loja
     * passaria a achar que entregamos.
     */
    return NextResponse.json({ ok: false, motivo: 'indisponivel' }, { status: 503 })
  }

  const resultado = await verificarCompraDaLoja({
    loja: loja as Loja,
    comprovante,
    perfil: session.userProfileId,
    produtoEsperado: PRODUTO_MENSAL,
    apple: { raizPem: raizDaApple(), bundleId: APP_ID, ambientes: ambientesDaApple() },
    google: { pacote: APP_ID },
  })

  if (!resultado.ok) {
    /*
     * O log guarda o perfil e o motivo, **nunca o comprovante**: ele é o
     * documento que concede acesso, e um log com ele dentro é uma cópia da
     * chave em texto puro.
     */
    logger.error('plus:loja_recusada', {
      perfil: session.userProfileId,
      loja,
      motivo: resultado.motivo,
    })
    const status = resultado.motivo === 'indisponivel' ? 503 : 422
    return NextResponse.json({ ok: false, motivo: resultado.motivo }, { status })
  }

  const estado = resultado.estado

  const { data: desfecho, error } = await admin.rpc('set_plus_subscription', {
    p_profile_id: session.userProfileId,
    p_status: estado.status,
    p_until: estado.until,
    p_provider: loja,
    p_provider_ref: estado.refDaLoja,
    p_event_at: estado.eventoEm,
    // Ver a nota do cabeçalho: este é o caminho da compra.
    p_takeover: true,
  })

  if (error) {
    logger.error('plus:loja_escrita_falhou', { perfil: session.userProfileId, erro: error.message })
    return NextResponse.json({ ok: false, motivo: 'indisponivel' }, { status: 503 })
  }

  /*
   * `STALE` é notificação fora de ordem — aqui significa que já havia estado
   * mais novo gravado, o que é sucesso para quem comprou: o acesso existe.
   * Confirmar na loja é certo nos dois casos.
   */
  logger.info('plus:loja_gravada', {
    perfil: session.userProfileId,
    loja,
    estado: estado.status,
    desfecho,
  })

  return NextResponse.json({ ok: true, status: estado.status, confirmar: true })
}
