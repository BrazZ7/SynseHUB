/** Estado das server actions de check-in. */
export type CheckInState = {
  status: 'idle' | 'success' | 'error'
  message?: string
  studentName?: string
}

export const initialCheckInState: CheckInState = { status: 'idle' }

/**
 * ── Há quanto tempo essa pessoa está treinando ─────────────────────────────
 *
 * Fora do componente porque é regra de leitura, e regra de leitura se testa
 * sem navegador — a mesma razão do `state.ts` de todo recurso aqui.
 *
 * Minutos abaixo de uma hora, nada de segundos: o painel é lido de relance na
 * recepção, e um número que muda a cada segundo pediria um redesenho por
 * segundo por linha para informação que ninguém usa nesse detalhe.
 *
 * Instante no futuro lê "agora mesmo", e isso importa: `started_at` vem do
 * banco e `agora` do processo que renderiza, e os dois relógios não são o
 * mesmo. "há -2 min" na tela faz duvidar do painel inteiro. Quem protege é o
 * `< 1` abaixo, que pega qualquer negativo — eu tinha escrito um
 * `Math.max(0, …)` junto, e ao mutar descobri que ele nunca mudava uma saída:
 * linha morta com comentário dizendo que protegia algo.
 */
export function haQuantoTempo(inicio: string, agora: number): string {
  const minutos = Math.floor((agora - new Date(inicio).getTime()) / 60_000)
  if (minutos < 1) return 'agora mesmo'
  if (minutos < 60) return `há ${minutos} min`

  const horas = Math.floor(minutos / 60)
  const resto = minutos % 60
  /*
   * Dois dígitos nos minutos: "1h5" se lê como uma hora e cinco ou como uma
   * hora e cinquenta? O zero resolve antes de alguém precisar perguntar.
   */
  return resto === 0 ? `há ${horas}h` : `há ${horas}h${String(resto).padStart(2, '0')}`
}
