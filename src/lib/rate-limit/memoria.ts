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

/**
 * ── A limpeza mora aqui, e não na memória de quem chama ────────────────────
 *
 * `limparExpirados` era chamado pelos handlers, "oportunisticamente" — e
 * contando, estava em **3 dos 20** caminhos que limitam alguma coisa. Login,
 * recuperação de senha, convite de equipe e a busca de aluno não limpavam
 * nada; os buckets vencidos ficavam até alguém abrir um programa guiado ou
 * assinar o Synse+.
 *
 * Não é vazamento grave — cada bucket são dois números —, mas depender de o
 * chamador lembrar é a forma como ele esquece: as três chamadas existentes
 * são de quando havia três lugares que limitavam, e nenhum dos dezessete
 * seguintes copiou a linha.
 *
 * A varredura é O(n) e só roda quando o mapa passa do teto, então o custo
 * fica diluído. O teto é alto de propósito: varrer a cada pedido trocaria um
 * desperdício de memória desprezível por trabalho em todo login.
 */
const TETO_ANTES_DE_VARRER = 5_000

export function contarNaMemoria(
  key: string,
  limit: number,
  windowMs: number,
  agora = Date.now(),
): RateLimitResult {
  if (store.size > TETO_ANTES_DE_VARRER) limparExpirados(agora)

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

/**
 * Limpa buckets expirados.
 *
 * `contarNaMemoria` chama sozinho quando o mapa cresce; isto segue exportado
 * para quem quiser forçar — e para o teste, que precisa provar a limpeza sem
 * criar cinco mil chaves.
 */
export function limparExpirados(agora = Date.now()) {
  for (const [key, bucket] of store.entries()) {
    if (bucket.resetAt <= agora) store.delete(key)
  }
}

/** Só para teste: zera o estado entre casos. */
export function esquecerTudo() {
  store.clear()
}

/** Só para teste: quantos buckets existem agora, e a partir de quanto varre. */
export const memoriaInterna = {
  tamanho: () => store.size,
  teto: TETO_ANTES_DE_VARRER,
}
