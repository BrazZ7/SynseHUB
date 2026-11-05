import 'server-only'

import { env } from '@/lib/env'

/**
 * As credenciais do Mercado Pago, e o que fazer sem elas.
 *
 * `MERCADOPAGO_ACCESS_TOKEN` assina as chamadas à API. `MERCADOPAGO_WEBHOOK_SECRET`
 * é o segredo do painel, usado só para conferir a assinatura do webhook —
 * nunca enviado a lugar nenhum.
 *
 * Nenhuma das duas tem valor padrão, e isso é a regra de sempre: segredo
 * ausente precisa falhar fechado. Sem o token a fábrica nem constrói este
 * provedor, e o app continua no simulado, dizendo que está no simulado.
 */
export const MERCADOPAGO_ACCESS_TOKEN = env(process.env.MERCADOPAGO_ACCESS_TOKEN, '')
export const MERCADOPAGO_WEBHOOK_SECRET = env(process.env.MERCADOPAGO_WEBHOOK_SECRET, '')

/** Dá para falar com o Mercado Pago? */
export function mercadoPagoConfigurado(): boolean {
  return MERCADOPAGO_ACCESS_TOKEN !== ''
}

/**
 * ── Por que o diagnóstico separa as duas ────────────────────────────────────
 *
 * Token sem segredo de webhook é o estado mais perigoso dos três: a assinatura
 * é criada, a pessoa paga, e a confirmação nunca chega porque todo webhook é
 * recusado. Dinheiro sai da conta dela e o Synse+ não liga.
 *
 * A sonda precisa distinguir isso de "nada configurado", que é inofensivo.
 */
export type DiagnosticoMercadoPago = {
  configurado: boolean
  token: 'ok' | 'ausente'
  segredoDoWebhook: 'ok' | 'ausente'
}

export function diagnosticoDoMercadoPago(): DiagnosticoMercadoPago {
  return {
    configurado: mercadoPagoConfigurado(),
    token: MERCADOPAGO_ACCESS_TOKEN ? 'ok' : 'ausente',
    segredoDoWebhook: MERCADOPAGO_WEBHOOK_SECRET ? 'ok' : 'ausente',
  }
}
