'use server'

import { redirect } from 'next/navigation'

import { APP } from '@/config/app'
import { requireStudentSession } from '@/lib/auth/require-session'
import { toUserMessage } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { getPaymentProvider, isSimulatedProvider } from '@/lib/payments'
import { PLUS_PRICE } from '@/lib/plans/tiers'
import { resumoDaAssinatura } from '@/lib/plans/subscription'
import { pruneRateLimits, rateLimit } from '@/lib/rate-limit'
import type { AdesaoState } from '@/features/plus/state'

/**
 * ── Começar a assinatura do Synse+ ───────────────────────────────────────────
 *
 * Esta ação **não** liga o Synse+. Ela cria a assinatura no provedor e manda a
 * pessoa autorizar o débito na tela dele. Quem liga é o webhook, depois que o
 * provedor confirma — a regra do projeto é que o front-end nunca confirma
 * pagamento, e aqui ela vale inteira: nem o retorno do checkout concede acesso.
 *
 * `external_reference` leva o id do perfil. É por ele que o webhook sabe de
 * quem é a assinatura, sem tabela de ligação no meio para divergir.
 */
export async function assinarPlusAction(
  _state: AdesaoState,
  _formData: FormData,
): Promise<AdesaoState> {
  const session = await requireStudentSession()

  pruneRateLimits()
  /*
   * Três por minuto. Cada clique cria uma assinatura pendente no Mercado Pago,
   * e uma tela travando com o botão apertado não pode encher a conta de
   * pendências — nem gastar chamada de API à toa.
   */
  if (!(await rateLimit(`plus:assinar:${session.userProfileId}`, 3, 60_000)).allowed) {
    return { status: 'error', message: 'Muitas tentativas. Espere um minuto e tente de novo.' }
  }

  // Já é assinante: não criar uma segunda cobrança para a mesma conta.
  if (resumoDaAssinatura(session.plus).ativa) {
    return { status: 'error', message: 'Sua conta já tem o Synse+ ativo.' }
  }

  /*
   * Sem provedor real não há o que abrir. Botão que leva a um checkout falso
   * é a mesma falha do PIX simulado, e a tela já sabe disso — isto aqui é a
   * trava do servidor, para o caso de a tela não saber.
   */
  if (isSimulatedProvider()) {
    return {
      status: 'error',
      message: 'A assinatura ainda não está disponível. Nenhuma cobrança foi feita.',
    }
  }

  let destino: string
  try {
    const assinatura = await getPaymentProvider().createSubscription({
      providerCustomerId: session.email,
      payerEmail: session.email,
      amount: PLUS_PRICE.monthly,
      description: 'Synse+',
      method: 'CREDIT_CARD',
      externalReference: session.userProfileId,
      cycle: 'MONTHLY',
      nextDueDate: new Date(Date.now() + PLUS_PRICE.trialDays * 86_400_000).toISOString(),
      trialDays: PLUS_PRICE.trialDays,
      backUrl: `${APP.url}/app/synse`,
    })

    if (!assinatura.checkoutUrl) {
      logger.error('plus:sem_checkout', { assinatura: assinatura.providerSubscriptionId })
      return {
        status: 'error',
        message: 'Não foi possível abrir o pagamento agora. Tente de novo em instantes.',
      }
    }

    logger.info('plus:assinatura_criada', {
      perfil: session.userProfileId,
      assinatura: assinatura.providerSubscriptionId,
    })
    destino = assinatura.checkoutUrl
  } catch (erro) {
    logger.error('plus:assinatura_falhou', { erro: String(erro) })
    return { status: 'error', message: toUserMessage(erro) }
  }

  /*
   * Fora do `try`: `redirect` sinaliza por exceção, e capturá-la aqui dentro
   * transformaria o sucesso numa mensagem de erro.
   */
  redirect(destino)
}
