import 'server-only'

/**
 * Comparação de tempo constante.
 *
 * Um `===` em segredo compartilhado vaza, pelo tempo de resposta, quantos
 * caracteres do começo estão certos — o suficiente para descobrir o token um
 * caractere por vez. Sai barato evitar.
 *
 * Estava escrita dentro do provedor de pagamento; saiu de lá quando o segundo
 * endereço com token apareceu. Duas cópias divergiriam, e a que ficasse para
 * trás seria justamente a que ninguém lembra de revisar.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * O portador apresentou o segredo certo?
 *
 * Sem segredo configurado a resposta é sempre não. Aceitar por omissão
 * transformaria um esquecimento de variável de ambiente numa porta aberta —
 * e nada na tela denunciaria isso.
 */
export function bearerAutorizado(header: string | null, esperado: string): boolean {
  if (!esperado) return false
  const recebido = (header ?? '').replace(/^Bearer\s+/i, '')
  if (!recebido) return false
  return timingSafeEqual(esperado, recebido)
}
