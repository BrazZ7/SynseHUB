import 'server-only'

import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import type { RateLimitResult } from '@/lib/rate-limit/memoria'

/**
 * ── Rate limit compartilhado, no Upstash ─────────────────────────────────────
 *
 * A contagem em memória não vale na Vercel: cada função tem a sua, e "cinco
 * por minuto" vira cinco **por instância**. O limite real passa a ser um
 * múltiplo que ninguém sabe qual é, e que muda com o tráfego — ou seja, não é
 * limite.
 *
 * Upstash por REST, e não por conexão TCP, porque função serverless abre e
 * fecha o tempo todo: um pool de conexões ali vira conexão vazada.
 *
 * ── Por que Lua, e não INCR + PEXPIRE no pipeline ───────────────────────────
 *
 * O `/pipeline` do Upstash executa em ordem mas **não é atômico**. Com INCR e
 * PEXPIRE separados existe um estado ruim de verdade: o INCR cria a chave, o
 * PEXPIRE falha, e a chave fica **sem prazo**. O contador nunca zera e a
 * pessoa fica barrada para sempre, sem nada explicando — num caminho de
 * login, isso é a conta travada.
 *
 * O script abaixo é uma operação só. Também evita depender do `NX` do
 * `PEXPIRE`, que pede Redis 7 e falharia de um jeito difícil de ler.
 */

const URL_BASE = env(process.env.UPSTASH_REDIS_REST_URL, '')
const TOKEN = env(process.env.UPSTASH_REDIS_REST_TOKEN, '')

export function upstashConfigurado(): boolean {
  return URL_BASE !== '' && TOKEN !== ''
}

/**
 * Conta e devolve o prazo, numa operação só.
 *
 * O `PEXPIRE` só entra quando o contador vale 1 — ou seja, no pedido que abre
 * a janela. Renová-lo a cada acesso transformaria janela fixa em "enquanto
 * insistir, nunca zera", que é exatamente o contrário do que se quer.
 */
const SCRIPT = `
local atual = redis.call('INCR', KEYS[1])
if atual == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return {atual, redis.call('PTTL', KEYS[1])}
`.trim()

/** Quanto esperar o Redis. Acima disso, o limitador sai da frente. */
const TIMEOUT_MS = 1_500

/**
 * Conta no Redis. Devolve `null` quando não deu — e aí quem chama decide.
 *
 * Nunca lança: o limitador é proteção em profundidade, não autorização. Quem
 * de fato barra escrita indevida é `requirePermission` e a RLS. Derrubar uma
 * ação de pagamento porque o Redis piscou trocaria um limite frouxo por uma
 * indisponibilidade.
 */
export async function contarNoRedis(
  key: string,
  limit: number,
  windowMs: number,
  fetchImpl: typeof fetch = fetch,
): Promise<RateLimitResult | null> {
  try {
    const resposta = await fetchImpl(URL_BASE, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['EVAL', SCRIPT, '1', key, String(windowMs)]),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    })

    if (!resposta.ok) {
      logger.warn('ratelimit:upstash_http', { status: resposta.status })
      return null
    }

    const corpo = (await resposta.json()) as { result?: unknown; error?: string }
    if (corpo.error) {
      logger.warn('ratelimit:upstash_erro', { erro: corpo.error.slice(0, 200) })
      return null
    }

    const dados = corpo.result
    if (!Array.isArray(dados) || dados.length < 2) {
      logger.warn('ratelimit:upstash_resposta_inesperada')
      return null
    }

    const contagem = Number(dados[0])
    const pttl = Number(dados[1])
    if (!Number.isFinite(contagem)) {
      logger.warn('ratelimit:upstash_resposta_inesperada')
      return null
    }

    /*
     * PTTL negativo é chave sem prazo (-1) ou ausente (-2). Com o script
     * acima não deveria acontecer; se acontecer, a janela cheia é o palpite
     * seguro — melhor errar para o lado de soltar cedo do que anunciar um
     * prazo que não existe.
     */
    const resetAt = Date.now() + (pttl > 0 ? pttl : windowMs)

    return {
      allowed: contagem <= limit,
      remaining: Math.max(0, limit - contagem),
      resetAt,
    }
  } catch (erro) {
    logger.warn('ratelimit:upstash_indisponivel', { erro: String(erro).slice(0, 200) })
    return null
  }
}
