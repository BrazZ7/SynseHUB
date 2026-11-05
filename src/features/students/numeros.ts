/**
 * Os números do aluno em texto, numa implementação só.
 *
 * ── Por que este arquivo existe ─────────────────────────────────────────────
 *
 * Estas duas funções nasceram dentro do histórico (0064), privadas. O resumo
 * semanal (0066) precisa das mesmas regras, e copiá-las traria de volta um
 * defeito que já custou: o treino encerrado em vinte segundos aparecia como
 * **"0 min"** — número verdadeiro que lê como erro.
 *
 * A regra não é óbvia o bastante para ser redescoberta igual duas vezes, então
 * ela mora aqui e as duas telas a importam.
 */

/**
 * A duração, ou `null` quando ela não chega a um minuto.
 *
 * `null` e não `"0 min"`: abaixo de 60s o arredondamento mentia para o olho. A
 * linha do histórico já tem séries e volume para dizer o que aconteceu, e uma
 * parte a menos é melhor que uma parte que parece defeito.
 */
export function duracao(segundos: number | null | undefined): string | null {
  if (segundos == null || segundos < 60) return null
  const h = Math.floor(segundos / 3600)
  const m = Math.round((segundos % 3600) / 60)
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`
}

/**
 * Metros em quilômetros, com uma casa e vírgula.
 *
 * `5000` vira `5 km` e não `5,0 km`: o zero à direita é ruído numa lista que a
 * pessoa rola.
 */
export function quilometros(metros: number | null | undefined): string {
  const km = (metros ?? 0) / 1000
  return `${km.toFixed(1).replace(/\.0$/, '').replace('.', ',')} km`
}

/** Peso com uma casa e vírgula, como a balança mostra. */
export function pesoEmKg(kg: number): string {
  return `${kg.toFixed(1).replace('.', ',')} kg`
}

/**
 * Concordância de número, porque "1 atividade(s)" é texto de rascunho.
 *
 * O "(s)" resolve o problema de quem escreve e empurra para quem lê. Numa tela
 * que a pessoa abre toda semana, ele aparece toda semana.
 *
 * A decisão é pelo módulo: `-1` e `1` pedem singular, e `0` pede plural em
 * português — "0 treinos", não "0 treino".
 */
export function plural(n: number, singular: string, plural: string): string {
  return Math.abs(n) === 1 ? singular : plural
}
