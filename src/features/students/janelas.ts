import { diaLocal } from '@/features/students/streak'

/**
 * As janelas de tempo que a tela conta: hoje, a semana, o mês.
 *
 * ── O defeito que isto corrige ──────────────────────────────────────────────
 *
 * A home montava as janelas com `new Date(ano, mes, dia)`, que é meia-noite no
 * fuso de **quem executa o código** — no servidor, UTC. No horário de Brasília
 * isso adianta o dia em três horas: às 21h de terça, o servidor já está na
 * quarta.
 *
 * O resultado aparecia na mesma tela, em dois números que discordavam. A
 * sequência de dias usa `diaLocal` com o fuso do produto e dizia "treinou
 * hoje"; o cartão ao lado, calculado em UTC, dizia que não. E o guarda do
 * check-in diário — "você já registrou presença hoje" — deixava passar um
 * segundo check-in entre as 21h e a meia-noite, porque para ele o dia já havia
 * virado. Dois check-ins no mesmo dia inflam a meta da semana e a contagem do
 * mês.
 *
 * ── Como a conta é feita ────────────────────────────────────────────────────
 *
 * `diaLocal` dá o dia civil no fuso ('2026-10-13'). Para virar instante, falta
 * saber quanto aquele fuso está deslocado de UTC — e o deslocamento é lido do
 * próprio `Intl`, não de uma tabela nossa: formatar o instante no fuso e ler o
 * resultado como se fosse UTC dá exatamente a diferença.
 *
 * Horário de verão: o Brasil não tem desde 2019, e a conta continua certa fora
 * disso porque o deslocamento é consultado no instante em questão. A exceção
 * conhecida é a hora exata da virada num fuso que mude — ali o início do dia
 * pode sair com uma hora de diferença. Vale registrar e não vale complicar.
 */

/** Minutos que o fuso está à frente de UTC no instante dado. -180 em Brasília. */
export function deslocamentoEmMinutos(instante: Date, fuso: string): number {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(instante)

  const pegar = (tipo: string) => Number(partes.find((parte) => parte.type === tipo)?.value ?? '0')
  /*
   * `hour` pode vir '24' em algumas implementações para meia-noite com
   * `hour12: false`. `% 24` evita um dia de erro no caso mais fácil de não
   * notar.
   */
  const comoUtc = Date.UTC(
    pegar('year'),
    pegar('month') - 1,
    pegar('day'),
    pegar('hour') % 24,
    pegar('minute'),
    pegar('second'),
  )

  return Math.round((comoUtc - instante.getTime()) / 60_000)
}

/** O instante em que o dia civil começou, no fuso. ISO, para comparar com o banco. */
export function inicioDoDiaLocal(agora: Date, fuso: string): string {
  const dia = diaLocal(agora, fuso)
  const meiaNoiteUtc = new Date(`${dia}T00:00:00Z`)
  const deslocamento = deslocamentoEmMinutos(meiaNoiteUtc, fuso)
  return new Date(meiaNoiteUtc.getTime() - deslocamento * 60_000).toISOString()
}

/** O começo do mês civil, no fuso. */
export function inicioDoMesLocal(agora: Date, fuso: string): string {
  const dia = diaLocal(agora, fuso)
  const primeiro = `${dia.slice(0, 7)}-01`
  const meiaNoiteUtc = new Date(`${primeiro}T00:00:00Z`)
  const deslocamento = deslocamentoEmMinutos(meiaNoiteUtc, fuso)
  return new Date(meiaNoiteUtc.getTime() - deslocamento * 60_000).toISOString()
}

/**
 * O começo da janela de `dias` dias, contando hoje.
 *
 * Sete dias é "hoje e os seis anteriores", não "168 horas atrás". A diferença
 * importa: a janela por horas faz o número cair no meio do dia conforme o
 * relógio anda, e quem abriu o app à noite vê um total menor do que viu de
 * manhã, sem ter feito nada.
 */
export function inicioDaJanelaDeDias(agora: Date, fuso: string, dias: number): string {
  const inicioDeHoje = new Date(inicioDoDiaLocal(agora, fuso))
  const passos = Math.max(1, Math.floor(dias)) - 1
  /*
   * Volta dia a dia pelo calendário, e não subtraindo milissegundos de uma vez:
   * num fuso com horário de verão, uma das voltas tem 23 ou 25 horas.
   */
  let cursor = inicioDeHoje
  for (let i = 0; i < passos; i += 1) {
    const anterior = new Date(cursor.getTime() - 12 * 60 * 60 * 1000)
    cursor = new Date(inicioDoDiaLocal(anterior, fuso))
  }
  return cursor.toISOString()
}

/**
 * Quantos dias distintos têm registro na janela.
 *
 * Dias, e não registros: dois check-ins no mesmo dia são um dia treinado, e
 * contar os dois é a contagem duplicada que o pedido manda evitar. O mesmo vale
 * para quem faz check-in na recepção e abre o Treino Ativo em seguida — é um
 * dia, visto por dois caminhos.
 */
export function diasComRegistro(
  instantes: readonly string[],
  fuso: string,
  desde: string,
): number {
  const dias = new Set<string>()
  for (const instante of instantes) {
    if (instante < desde) continue
    dias.add(diaLocal(new Date(instante), fuso))
  }
  return dias.size
}
