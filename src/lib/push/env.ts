import { env } from '@/lib/env'

/**
 * ── As chaves VAPID ──────────────────────────────────────────────────────────
 *
 * O push web exige um par de chaves que identifica o servidor para o serviço
 * de entrega do navegador. A pública vai para o cliente na hora de se
 * inscrever; a privada assina o envio e **nunca sai do servidor**.
 *
 * Gerar é um comando: `npx web-push generate-vapid-keys`. Nenhuma das duas
 * entra no repositório — nem a de desenvolvimento, porque `.env.example` é
 * copiado, e chave de exemplo vira chave de produção de alguém.
 *
 * ── Sem chave, o recurso não existe ─────────────────────────────────────────
 *
 * E a tela diz isso, em vez de oferecer um botão que falha no clique. É a
 * mesma regra da cobrança: simulado em cima de banco real é mentira.
 */

export const VAPID_PUBLIC_KEY = env(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, '')

export function pushConfigurado(): boolean {
  return (
    VAPID_PUBLIC_KEY.length > 0 &&
    env(process.env.VAPID_PRIVATE_KEY, '').length > 0 &&
    env(process.env.VAPID_SUBJECT, '').length > 0
  )
}
