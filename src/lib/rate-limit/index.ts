import { contarNaMemoria, limparExpirados, type RateLimitResult } from '@/lib/rate-limit/memoria'
import { contarNoRedis, upstashConfigurado } from '@/lib/rate-limit/upstash'

/**
 * ── Onde a contagem mora ─────────────────────────────────────────────────────
 *
 * Com Upstash configurado, no Redis, compartilhada entre todas as instâncias.
 * Sem ele, na memória do processo — que é o certo em desenvolvimento, em
 * teste e na demonstração, onde há uma instância só.
 *
 * ── Quando o Redis falha, o limitador sai da frente ─────────────────────────
 *
 * E essa é a decisão que merece ser discutida, porque ela tem um custo real.
 *
 * Falhar fechado — recusar tudo enquanto o Redis não responde — trocaria um
 * limite frouxo por uma indisponibilidade total: ninguém faz login, ninguém
 * paga, ninguém faz check-in. Falhar aberto perde a proteção por alguns
 * minutos.
 *
 * O desempate é o que o limitador **é**: proteção em profundidade, não
 * autorização. Quem barra escrita indevida é `requirePermission` e a RLS, e
 * nenhum dos dois depende do Redis. O que se perde numa queda é a defesa
 * contra força bruta e enumeração; o que se perderia fechando é o produto.
 *
 * A queda não é silenciosa: `contarNoRedis` registra o motivo, e cair na
 * memória é melhor que não contar nada — numa instância só, o limite até
 * vale.
 */
export type { RateLimitResult } from '@/lib/rate-limit/memoria'

export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  if (upstashConfigurado()) {
    const noRedis = await contarNoRedis(key, limit, windowMs)
    if (noRedis) return noRedis
    // Redis fora do ar: a memória desta instância ainda é melhor que nada.
  }

  return contarNaMemoria(key, limit, windowMs)
}

/**
 * Limpa o que venceu na memória desta instância.
 *
 * Continua síncrona e continua valendo a pena mesmo com Redis: as chaves do
 * Redis vencem sozinhas, mas o reserva pode ter sido usado numa queda, e o
 * que ele deixou para trás ninguém mais limpa.
 */
export function pruneRateLimits() {
  limparExpirados()
}

/** O limite está valendo para todas as instâncias, ou só para esta? */
export function rateLimitCompartilhado(): boolean {
  return upstashConfigurado()
}
