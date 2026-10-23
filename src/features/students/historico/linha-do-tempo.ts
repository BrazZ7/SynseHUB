import { diaLocal } from '@/features/students/streak'
import type { TimelineCursor, TimelineEntry, TimelineKind } from '@/types/domain'

/**
 * ── O histórico integrado, do lado da tela ───────────────────────────────────
 *
 * A função do banco (0064) devolve uma lista plana em ordem de tempo. O que
 * falta é agrupar por dia e dizer, em uma linha, o que cada acontecimento foi.
 *
 * Tudo aqui é função pura, fora do componente: agrupar por dia depende do
 * fuso, e fuso é exatamente o tipo de conta que erra em silêncio — o check-in
 * das 23h caindo no dia seguinte é o mesmo defeito que a sequência de treinos
 * já teve uma vez.
 */

/** O rótulo de cada origem. Curto: ele divide espaço com a hora e o resumo. */
const NOME_DO_TIPO: Record<TimelineKind, string> = {
  TREINO: 'Treino',
  CORRIDA: 'Corrida',
  CHECKIN: 'Check-in',
  PESAGEM: 'Pesagem',
}

export function nomeDoTipo(kind: TimelineKind): string {
  return NOME_DO_TIPO[kind]
}

export type DiaDaLinhaDoTempo = {
  /** `2026-10-23`, no fuso da academia. */
  dia: string
  entradas: TimelineEntry[]
}

/**
 * Agrupa por dia civil, mantendo a ordem que veio.
 *
 * **No fuso da academia, não no do servidor.** Em `America/Sao_Paulo` um
 * treino das 22h de terça é `2026-10-20`; lido em UTC vira `2026-10-21`, e a
 * pessoa vê o treino de ontem listado como de hoje. O servidor roda em UTC,
 * então sem o fuso isso acontece com **todo** evento depois das 21h.
 *
 * Não reordena: a lista chega do banco em ordem total (data desc, id desc) e
 * reordenar aqui só criaria uma segunda definição de ordem para divergir da
 * primeira.
 */
export function agruparPorDia(
  entradas: readonly TimelineEntry[],
  fuso: string,
): DiaDaLinhaDoTempo[] {
  const dias: DiaDaLinhaDoTempo[] = []

  for (const entrada of entradas) {
    const dia = diaLocal(new Date(entrada.happenedAt), fuso)
    const ultimo = dias.at(-1)
    if (ultimo?.dia === dia) ultimo.entradas.push(entrada)
    else dias.push({ dia, entradas: [entrada] })
  }

  return dias
}

/**
 * O cursor da próxima página: o último item desta.
 *
 * `null` quando a página veio menor que o pedido — aí não há próxima, e
 * oferecer "carregar mais" para encontrar nada é pior que não oferecer.
 */
export function proximoCursor(
  entradas: readonly TimelineEntry[],
  pedido: number,
): TimelineCursor | null {
  if (entradas.length < pedido) return null
  const ultimo = entradas.at(-1)
  return ultimo ? { at: ultimo.happenedAt, id: ultimo.refId } : null
}

/**
 * A duração, ou `null` quando ela não chega a um minuto.
 *
 * Abaixo de 60s o arredondamento dava **"0 min"** — vi no histórico de um
 * treino encerrado em vinte segundos. O número é verdadeiro e lê como
 * defeito; a linha já tem séries e volume para dizer o que aconteceu, e uma
 * parte a menos é melhor que uma parte que parece erro.
 */
function minutos(segundos: number): string | null {
  if (segundos < 60) return null
  const h = Math.floor(segundos / 3600)
  const m = Math.round((segundos % 3600) / 60)
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`
}

function quilometros(metros: number): string {
  /*
   * Uma casa decimal. `5000` vira `5 km` e não `5.0 km`: o zero à direita é
   * ruído numa lista que a pessoa rola.
   */
  const km = metros / 1000
  return `${km.toFixed(1).replace(/\.0$/, '').replace('.', ',')} km`
}

/**
 * A linha de resumo de um acontecimento.
 *
 * Um item por pedaço, para a tela juntar com separador. Vazio quando não há
 * número nenhum a dizer — o check-in é o fato, e inventar "1 presença" seria
 * encher linha.
 */
export function resumoDaEntrada(entrada: TimelineEntry): string[] {
  const partes: string[] = []

  switch (entrada.kind) {
    case 'TREINO': {
      const tempo = entrada.durationSeconds ? minutos(entrada.durationSeconds) : null
      if (tempo) partes.push(tempo)
      if (entrada.setsCount) partes.push(`${entrada.setsCount} séries`)
      if (entrada.volumeKg) partes.push(`${Math.round(entrada.volumeKg)} kg de volume`)
      if (entrada.effort != null) partes.push(`esforço ${entrada.effort}/10`)
      break
    }
    case 'CORRIDA': {
      if (entrada.distanceMeters) partes.push(quilometros(entrada.distanceMeters))
      const tempo = entrada.durationSeconds ? minutos(entrada.durationSeconds) : null
      if (tempo) partes.push(tempo)
      break
    }
    case 'PESAGEM': {
      if (entrada.weightKg != null) {
        partes.push(`${entrada.weightKg.toFixed(1).replace('.', ',')} kg`)
      }
      break
    }
    case 'CHECKIN':
      break
  }

  return partes
}

/** O elo para a tela daquele acontecimento. `null` quando não há tela. */
export function elo(entrada: TimelineEntry): string | null {
  switch (entrada.kind) {
    case 'CORRIDA':
      return `/app/run/${entrada.refId}`
    case 'PESAGEM':
      return '/app/corpo'
    /*
     * O treino concluído não tem tela própria — `/app/workout` mostra o de
     * hoje, e mandar para lá a partir de um treino de três semanas atrás
     * abriria outra coisa. Sem elo é melhor que elo que mente.
     */
    case 'TREINO':
    case 'CHECKIN':
      return null
  }
}
