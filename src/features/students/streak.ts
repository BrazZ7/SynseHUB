/**
 * A sequência de dias de treino.
 *
 * ── A regra ─────────────────────────────────────────────────────────────────
 *
 * Conta dias seguidos com check-in, andando do presente para trás. Faltar
 * quebra — **exceto** sábado e domingo, que a sequência atravessa sem perder.
 * Quem treina de segunda a sexta mantém a sequência viva no fim de semana sem
 * precisar aparecer na academia.
 *
 * Fim de semana com check-in **conta**: quem foi no sábado ganha o dia. O que
 * ele nunca faz é quebrar.
 *
 * ── O dia de hoje não conta contra ──────────────────────────────────────────
 *
 * Abrir o app às oito da manhã não pode zerar a sequência de alguém que treina
 * à noite. Se hoje ainda não tem check-in, a contagem começa de ontem — o dia
 * só cobra quando termina.
 *
 * ── O que esta regra não sabe ───────────────────────────────────────────────
 *
 * Feriado. Quem não treina no feriado de uma terça perde a sequência, e isso é
 * uma decisão de produto por enquanto: um calendário de feriados municipais
 * seria a próxima coisa, não algo a improvisar aqui.
 */

/** O dia civil de um instante, no fuso da academia. `2026-09-18`. */
export function diaLocal(instante: Date, fuso: string): string {
  /*
   * `en-CA` porque ele formata como `AAAA-MM-DD` — a ordenação alfabética
   * coincide com a cronológica, que é o que o resto deste arquivo usa.
   */
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instante)
}

/**
 * O dia da semana de uma data civil.
 *
 * Ancorado ao meio-dia UTC: a string já é local, e usar meia-noite faria um
 * fuso a oeste de Greenwich cair no dia anterior.
 */
function diaDaSemana(dia: string): number {
  return new Date(`${dia}T12:00:00Z`).getUTCDay()
}

export function ehFimDeSemana(dia: string): boolean {
  const semana = diaDaSemana(dia)
  return semana === 0 || semana === 6
}

export function diaAnterior(dia: string): string {
  const data = new Date(`${dia}T12:00:00Z`)
  data.setUTCDate(data.getUTCDate() - 1)
  return data.toISOString().slice(0, 10)
}

export type Sequencia = {
  /** Dias de treino seguidos. Zero quando a sequência está quebrada. */
  dias: number
  /** Já treinou hoje? A chama acesa vale mais que a apagada. */
  hoje: boolean
  /**
   * A sequência está viva mas hoje ainda falta.
   *
   * É o estado que a tela usa para cutucar sem assustar: "não perca a
   * sequência" só faz sentido para quem tem uma.
   */
  emRisco: boolean
}

/**
 * Calcula a sequência a partir dos instantes de check-in.
 *
 * Recebe os instantes crus e não datas já agrupadas: agrupar por dia depende
 * do fuso da academia, e quem sabe o fuso é quem chama — deixar isso do lado
 * de fora abriria caminho para dois lugares agruparem diferente.
 */
export function calcularSequencia(
  checkIns: readonly { checkedInAt: string }[],
  opcoes: { fuso: string; agora?: Date },
): Sequencia {
  const agora = opcoes.agora ?? new Date()
  const hojeStr = diaLocal(agora, opcoes.fuso)

  const dias = new Set(
    checkIns
      .map((c) => new Date(c.checkedInAt))
      .filter((d) => !Number.isNaN(d.getTime()))
      .map((d) => diaLocal(d, opcoes.fuso)),
  )

  if (dias.size === 0) return { dias: 0, hoje: false, emRisco: false }

  const treinouHoje = dias.has(hojeStr)
  // O mais antigo é o fundo do poço: sem ele, uma sequência ininterrupta
  // faria o laço andar para trás para sempre.
  const maisAntigo = [...dias].sort()[0]

  let cursor = treinouHoje ? hojeStr : diaAnterior(hojeStr)
  let total = 0

  while (cursor >= maisAntigo) {
    if (dias.has(cursor)) {
      total += 1
      cursor = diaAnterior(cursor)
      continue
    }
    // A ponte do fim de semana: atravessa sem contar e sem quebrar.
    if (ehFimDeSemana(cursor)) {
      cursor = diaAnterior(cursor)
      continue
    }
    break
  }

  return { dias: total, hoje: treinouHoje, emRisco: total > 0 && !treinouHoje }
}
