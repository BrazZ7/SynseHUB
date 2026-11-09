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
  /**
   * Chamado com o motivo quando não deu, e só pela sonda de saúde.
   *
   * O limitador não passa nada aqui: para ele o motivo já vai para o log e o
   * comportamento é o mesmo em todos os casos — sai da frente. Quem precisa
   * distinguir é quem está **ligando** o Redis, porque "não respondeu" tem
   * quatro causas com consertos diferentes.
   */
  aoFalhar?: (motivo: string) => void,
): Promise<RateLimitResult | null> {
  const falhou = (motivo: string) => {
    aoFalhar?.(motivo)
    return null
  }

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
      return falhou(`http_${resposta.status}`)
    }

    const corpo = (await resposta.json()) as { result?: unknown; error?: string }
    if (corpo.error) {
      logger.warn('ratelimit:upstash_erro', { erro: corpo.error.slice(0, 200) })
      // O texto do Redis, cortado: ele diz "NOPERM"/"permission" no token
      // somente-leitura, que é o erro mais provável de quem está ligando.
      return falhou(`redis: ${semOEndereco(corpo.error).slice(0, 120)}`)
    }

    const dados = corpo.result
    if (!Array.isArray(dados) || dados.length < 2) {
      logger.warn('ratelimit:upstash_resposta_inesperada')
      return falhou('resposta_inesperada')
    }

    const contagem = Number(dados[0])
    const pttl = Number(dados[1])
    if (!Number.isFinite(contagem)) {
      logger.warn('ratelimit:upstash_resposta_inesperada')
      return falhou('contagem_nao_numerica')
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
    /*
     * Rede, DNS ou o tempo estourando. `TimeoutError` aqui costuma ser URL de
     * conexão (`rediss://`) no lugar da URL REST: o `fetch` tenta falar HTTP
     * com a porta do Redis e fica pendurado até o limite.
     */
    return falhou(`sem_resposta: ${semOEndereco(String(erro)).slice(0, 120)}`)
  }
}

/** O que a sonda de saúde descobriu sobre o Redis. */
export type DiagnosticoUpstash = {
  /** As duas variáveis estão preenchidas? */
  configurado: boolean
  /** O Redis respondeu, e com permissão de escrita? Nulo quando nem foi tentado. */
  respondendo: boolean | null
  /** Quanto demorou a ida e volta, em milissegundos. */
  latenciaMs: number | null
  /**
   * Por que não respondeu. Ausente quando respondeu.
   *
   * `respondendo: false` sozinho manda a pessoa adivinhar entre quatro
   * consertos diferentes — e o mais provável, o token somente-leitura, é
   * indistinguível de "errei o token" sem isto.
   */
  motivo?: string
  /**
   * A forma da URL configurada, sem revelar qual é.
   *
   * `tcp` é o erro de colar a URL de conexão (`rediss://…`) no lugar da REST:
   * o `fetch` tenta falar HTTP com a porta do Redis e fica pendurado até o
   * tempo estourar, então o sintoma chega como "sem resposta" e parece rede.
   *
   * `com_aspas` é o que de fato aconteceu ao ligar isto em produção: o valor
   * foi colado com as aspas em volta, e `fetch` recusou a URL antes de haver
   * rede. Era indistinguível de "endereço errado" sem este caso.
   */
  urlParece?: 'rest' | 'tcp' | 'com_aspas' | 'outra'
}

/** A forma da URL, olhada sem ir à rede e sem publicar o endereço. */
function formatoDaUrl(url: string): DiagnosticoUpstash['urlParece'] {
  if (/^["'`]|["'`]$/.test(url)) return 'com_aspas'
  if (/^rediss?:\/\//i.test(url)) return 'tcp'
  if (/^https:\/\/[^/]+\.upstash\.io\/?$/i.test(url)) return 'rest'
  return 'outra'
}

/**
 * O endereço fora do texto do erro.
 *
 * `/api/health` é público, e o `TypeError` do `fetch` traz a URL inteira
 * dentro da mensagem — foi o que apareceu em produção. O endereço não é
 * segredo (sem o token ele não serve), mas publicá-lo num endereço aberto não
 * era a intenção: o campo `urlParece` existe justamente para falar da URL sem
 * mostrá-la, e deixar o texto do erro contrariar isso seria manter o cuidado
 * só na aparência.
 */
function semOEndereco(texto: string): string {
  return texto
    .replace(/https?:\/\/[^\s"'`)]+/gi, '<url>')
    .replace(/rediss?:\/\/[^\s"'`)]+/gi, '<url>')
}

/**
 * ── Ele responde mesmo, ou só a variável está preenchida? ───────────────────
 *
 * `upstashConfigurado()` responde "as duas variáveis não estão vazias", e a
 * saúde publicava isso como `rateLimitCompartilhado`. Token errado, token
 * **somente-leitura** (o painel do Upstash oferece os dois, e o de leitura é
 * o primeiro da lista) ou banco apagado passavam como `true` — e cada pedido
 * caía para a memória em silêncio, que é exatamente o estado que o campo
 * existe para denunciar.
 *
 * É o mesmo formato de sonda cega que já me enganou duas vezes neste projeto:
 * uma que mede a configuração em vez do efeito não mede nada.
 *
 * ── Por que escrever, e não um PING ─────────────────────────────────────────
 *
 * `PING` passa com token somente-leitura, e aí a sonda aprovaria justamente a
 * credencial que não serve. Esta chama o **mesmo caminho do limitador** —
 * `EVAL` do script, que incrementa e põe prazo —, então o que ela aprova é o
 * que o produto usa. A chave é própria e vence em dez segundos; não encosta
 * na contagem de ninguém.
 */
export async function sondarUpstash(fetchImpl: typeof fetch = fetch): Promise<DiagnosticoUpstash> {
  if (!upstashConfigurado()) {
    return { configurado: false, respondendo: null, latenciaMs: null }
  }

  const comecou = Date.now()
  let motivo: string | undefined
  const resultado = await contarNoRedis('health:sonda', 1_000_000, 10_000, fetchImpl, (m) => {
    motivo = m
  })

  if (resultado !== null) {
    return { configurado: true, respondendo: true, latenciaMs: Date.now() - comecou }
  }

  return {
    configurado: true,
    respondendo: false,
    latenciaMs: null,
    motivo: motivo ?? 'desconhecido',
    urlParece: formatoDaUrl(URL_BASE),
  }
}
