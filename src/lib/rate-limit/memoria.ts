/**
 * Rate limit em memória — o reserva, e o padrão em desenvolvimento.
 *
 * Janela fixa: o primeiro pedido abre a janela e os seguintes contam dentro
 * dela até ela vencer.
 *
 * ── Por que ele continua existindo ──────────────────────────────────────────
 *
 * Porque sem Redis configurado a alternativa seria não limitar nada, e um
 * limitador que some quando a variável de ambiente falta é pior que nenhum:
 * ninguém percebe. Em uma instância só — desenvolvimento, teste, demonstração
 * — ele faz o trabalho inteiro.
 *
 * O que ele não faz é valer para mais de uma instância. Na Vercel cada função
 * tem a sua memória, então cinco tentativas por minuto viram cinco **por
 * instância**, e o limite real é um múltiplo que ninguém sabe qual é.
 */
export type RateLimitResult = {
  allowed: boolean
  remaining: number
  resetAt: number
}

type Bucket = { count: number; resetAt: number }

const store = new Map<string, Bucket>()

export function contarNaMemoria(
  key: string,
  limit: number,
  windowMs: number,
  agora = Date.now(),
): RateLimitResult {
  const bucket = store.get(key)

  if (!bucket || bucket.resetAt <= agora) {
    const resetAt = agora + windowMs
    store.set(key, { count: 1, resetAt })
    return { allowed: true, remaining: limit - 1, resetAt }
  }

  bucket.count += 1
  const allowed = bucket.count <= limit
  return { allowed, remaining: Math.max(0, limit - bucket.count), resetAt: bucket.resetAt }
}

/** Limpa buckets expirados. Chamado oportunisticamente pelos handlers. */
export function limparExpirados(agora = Date.now()) {
  for (const [key, bucket] of store.entries()) {
    if (bucket.resetAt <= agora) store.delete(key)
  }
}

/** Só para teste: zera o estado entre casos. */
export function esquecerTudo() {
  store.clear()
}
