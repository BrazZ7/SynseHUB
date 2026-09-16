/**
 * Rate limit em memória (janela deslizante simples).
 *
 * Suficiente para uma instância e para proteger endpoints sensíveis em
 * desenvolvimento. Em produção multi-instância trocar o `store` por Redis /
 * Upstash mantendo esta mesma assinatura.
 */
type Bucket = { count: number; resetAt: number }

const store = new Map<string, Bucket>()

export type RateLimitResult = {
  allowed: boolean
  remaining: number
  resetAt: number
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  const bucket = store.get(key)

  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + windowMs
    store.set(key, { count: 1, resetAt })
    return { allowed: true, remaining: limit - 1, resetAt }
  }

  bucket.count += 1
  const allowed = bucket.count <= limit
  return { allowed, remaining: Math.max(0, limit - bucket.count), resetAt: bucket.resetAt }
}

/** Limpa buckets expirados. Chamado oportunisticamente pelos handlers. */
export function pruneRateLimits() {
  const now = Date.now()
  for (const [key, bucket] of store.entries()) {
    if (bucket.resetAt <= now) store.delete(key)
  }
}
