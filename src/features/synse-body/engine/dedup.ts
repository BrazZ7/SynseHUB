import type { BodyMeasurement } from './types'

/**
 * A mesma pesagem chegando mais de uma vez.
 *
 * São três caminhos diferentes para o mesmo estrago, e cada um precisa da sua
 * defesa:
 *
 * 1. **A fila offline reenvia** o pacote idêntico. Resolvido pelo `clientId`,
 *    gerado no aparelho: o banco tem `unique (user_profile_id, client_id)` e
 *    devolve o mesmo id, então o reenvio é inofensivo.
 * 2. **A balança notifica a estabilização várias vezes**, e o app gera um
 *    `clientId` novo a cada notificação. O `clientId` não pega; o índice
 *    `(pessoa, aparelho, instante)` pega — mas só depois da viagem de rede.
 *    Esta função pega antes, e é o que evita a tela mostrar erro de duplicata
 *    para algo que é comportamento normal do aparelho.
 * 3. **A pessoa sobe duas vezes seguidas** para conferir. Aí são duas pesagens
 *    de verdade, e o histórico deve mostrar as duas.
 *
 * O que separa o caso 2 do caso 3 é o instante, não o peso: duas subidas
 * levam segundos de diferença; duas notificações da mesma pesagem chegam no
 * mesmo instante ou a milissegundos dele.
 */

/** Janela em que duas leituras do mesmo aparelho são a mesma pesagem. */
export const JANELA_REPETICAO_MS = 2_000
/** E o quanto elas podem diferir em quilo dentro dessa janela. */
export const TOLERANCIA_REPETICAO_KG = 0.1

export function mesmaPesagem(
  a: Pick<BodyMeasurement, 'measuredAt' | 'weightKg' | 'deviceId' | 'clientId'>,
  b: Pick<BodyMeasurement, 'measuredAt' | 'weightKg' | 'deviceId' | 'clientId'>,
): boolean {
  if (a.clientId === b.clientId) return true

  /*
   * Sem aparelho não há repetição de aparelho: duas entradas manuais no mesmo
   * minuto são duas decisões da pessoa, e apagar uma seria decidir por ela.
   */
  if (!a.deviceId || !b.deviceId || a.deviceId !== b.deviceId) return false

  const distancia = Math.abs(new Date(a.measuredAt).getTime() - new Date(b.measuredAt).getTime())
  if (!Number.isFinite(distancia) || distancia > JANELA_REPETICAO_MS) return false

  return Math.abs(a.weightKg - b.weightKg) <= TOLERANCIA_REPETICAO_KG
}

/** A medição já está no histórico que o app tem em mãos? */
export function jaRegistrada(
  nova: BodyMeasurement,
  existentes: readonly BodyMeasurement[],
): BodyMeasurement | null {
  return existentes.find((antiga) => mesmaPesagem(nova, antiga)) ?? null
}

/**
 * Identificador da pesagem, criado antes de existir rede.
 *
 * Mesma ideia do SynseRun e do Treino Ativo: o aparelho decide o id, e por
 * isso o reenvio nunca vira linha nova.
 */
export function novoClientId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `body-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
