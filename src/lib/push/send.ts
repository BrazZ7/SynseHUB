import 'server-only'

import webpush from 'web-push'

import { VAPID_PUBLIC_KEY, pushConfigurado } from '@/lib/push/env'
import { createSupabaseAdminClient } from '@/lib/database/supabase-admin'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'

/**
 * ── Enviar o aviso ───────────────────────────────────────────────────────────
 *
 * Lê as inscrições pela chave de serviço, porque `push_subscriptions` não tem
 * política de leitura: o que ela guarda é capacidade de escrever na tela de
 * alguém, e ninguém alcança isso pela API autenticada.
 *
 * ── Nunca derruba quem chamou ───────────────────────────────────────────────
 *
 * O aviso é acessório do que acabou de acontecer. Se o pedido de amizade foi
 * gravado e o push falhou, o pedido continua valendo — devolver erro faria a
 * pessoa tentar de novo e criar confusão por causa de uma notificação. Toda
 * falha vira log e `false`.
 */

export type Aviso = {
  titulo: string
  corpo?: string
  /** Para onde o clique leva. Caminho interno. */
  url?: string
  /** Avisos com a mesma tag se substituem em vez de empilhar. */
  tag?: string
}

/** Inscrição que o navegador considera morta — some do banco em vez de ficar. */
const MORTAS = [404, 410]

function configurar(): boolean {
  if (!pushConfigurado()) return false
  webpush.setVapidDetails(
    env(process.env.VAPID_SUBJECT, ''),
    VAPID_PUBLIC_KEY,
    env(process.env.VAPID_PRIVATE_KEY, ''),
  )
  return true
}

/**
 * Manda um aviso para todos os aparelhos de uma conta.
 *
 * Devolve quantos saíram. Zero é resposta legítima: a pessoa pode não ter
 * ligado o aviso, e isso não é erro de ninguém.
 */
export async function enviarAviso(userProfileId: string, aviso: Aviso): Promise<number> {
  if (!configurar()) return 0

  const admin = createSupabaseAdminClient()
  if (!admin) {
    logger.warn('push:sem_service_role')
    return 0
  }

  const { data, error } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_profile_id', userProfileId)

  if (error) {
    logger.warn('push:leitura_falhou', { error: error.message })
    return 0
  }

  const inscricoes = data ?? []
  if (inscricoes.length === 0) return 0

  const corpo = JSON.stringify(aviso)
  let entregues = 0
  const mortas: string[] = []

  await Promise.all(
    inscricoes.map(async (inscricao) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: inscricao.endpoint as string,
            keys: { p256dh: inscricao.p256dh as string, auth: inscricao.auth as string },
          },
          corpo,
        )
        entregues += 1
      } catch (erro) {
        const status = (erro as { statusCode?: number }).statusCode
        if (status && MORTAS.includes(status)) {
          /*
           * 404 e 410 são o navegador dizendo que aquela inscrição não existe
           * mais — aparelho trocado, app desinstalado. Guardar não adianta, e
           * tentar de novo a cada aviso faz a tabela crescer com lixo que
           * nunca entrega nada.
           */
          mortas.push(inscricao.endpoint as string)
        } else {
          logger.warn('push:envio_falhou', { status: status ?? null })
        }
      }
    }),
  )

  if (mortas.length > 0) {
    await admin.from('push_subscriptions').delete().in('endpoint', mortas)
    logger.info('push:inscricoes_removidas', { quantas: mortas.length })
  }

  return entregues
}
