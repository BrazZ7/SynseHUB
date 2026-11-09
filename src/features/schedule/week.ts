import type { ClassSession } from '@/types/domain'

/**
 * A semana da agenda, em funções puras.
 *
 * Fora dos componentes porque data é onde o erro passa despercebido: uma aula
 * na coluna errada parece um detalhe visual, e é o professor indo ao ginásio no
 * dia errado. Aqui dá para testar sem montar tela.
 */

const DIA_MS = 86_400_000

/** A segunda-feira da semana que contém a data. Semana brasileira começa nela. */
export function inicioDaSemana(referencia: Date): Date {
  const dia = new Date(referencia)
  dia.setHours(0, 0, 0, 0)
  // getDay(): 0 = domingo. Domingo pertence à semana que começou na segunda anterior.
  const desdeSegunda = (dia.getDay() + 6) % 7
  return new Date(dia.getTime() - desdeSegunda * DIA_MS)
}

/** Os sete dias da semana, de segunda a domingo. */
export function diasDaSemana(inicio: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => new Date(inicio.getTime() + i * DIA_MS))
}

export function somarSemanas(inicio: Date, quantas: number): Date {
  return new Date(inicio.getTime() + quantas * 7 * DIA_MS)
}

/** A janela que a consulta pede: início inclusivo, fim exclusivo. */
export function janelaDaSemana(inicio: Date) {
  return {
    from: inicio.toISOString(),
    to: new Date(inicio.getTime() + 7 * DIA_MS).toISOString(),
  }
}

/** Chave de agrupamento por dia local. Nunca `toISOString().slice(0,10)`. */
export function chaveDoDia(data: Date | string): string {
  const d = typeof data === 'string' ? new Date(data) : data
  /*
   * A data local, montada campo a campo. `toISOString()` converte para UTC
   * antes de cortar, e uma aula às 21h em São Paulo cai no dia seguinte — é
   * assim que a aula de sexta aparece no sábado.
   */
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

export function agruparPorDia(sessoes: ClassSession[]): Map<string, ClassSession[]> {
  const mapa = new Map<string, ClassSession[]>()
  for (const sessao of sessoes) {
    const chave = chaveDoDia(sessao.startsAt)
    const lista = mapa.get(chave) ?? []
    lista.push(sessao)
    mapa.set(chave, lista)
  }
  for (const lista of mapa.values()) lista.sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  return mapa
}

export type OcupacaoAula = {
  ocupadas: number
  vagas: number
  lotada: boolean
  /** Fração de 0 a 1, para a barra. Passa de 1 quando há espera. */
  proporcao: number
}

export function ocupacao(sessao: ClassSession): OcupacaoAula {
  const ocupadas = Math.max(sessao.bookedCount, 0)
  return {
    ocupadas,
    vagas: Math.max(sessao.capacity - ocupadas, 0),
    lotada: ocupadas >= sessao.capacity,
    proporcao: sessao.capacity > 0 ? ocupadas / sessao.capacity : 0,
  }
}

/** `HH:MM` local. */
export function horaLocal(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function rotuloDoDia(data: Date): string {
  return data.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
}

export function ehHoje(data: Date): boolean {
  return chaveDoDia(data) === chaveDoDia(new Date())
}
