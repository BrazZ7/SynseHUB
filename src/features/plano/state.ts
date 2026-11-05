import type { RoutineBlock, RoutineKind } from '@/types/domain'

/**
 * ── A rotina, fora da tela ──────────────────────────────────────────────────
 *
 * Ordenar o dia, achar o que é agora, e dizer o que cada bloco significa.
 * Função pura porque é aqui que mora o erro invisível: um bloco no dia errado,
 * um "agora" que aponta para o de ontem, um horário que some na virada da
 * meia-noite.
 */

/**
 * Os sete tipos de bloco, e o que cada um diz na tela.
 *
 * **Sem medicação**, e isso é decisão da 0070: remédio é dado de saúde com
 * regra própria — consentimento, retenção, quem pode ver —, e convidar para
 * digitá-lo num campo que nasceu para "almoço" é recolher dado sensível pela
 * porta dos fundos.
 */
export const TIPOS: ReadonlyArray<{
  valor: RoutineKind
  rotulo: string
  /** O que a tela mostra quando a pessoa não deu nome ao bloco. */
  padrao: string
  /** O que o aviso diz. Imperativo curto, porque chega na tela bloqueada. */
  aviso: string
}> = [
  { valor: 'AGUA', rotulo: 'Água', padrao: 'Beber água', aviso: 'Hora de beber água' },
  { valor: 'REFEICAO', rotulo: 'Refeição', padrao: 'Refeição', aviso: 'Hora de comer' },
  { valor: 'TREINO', rotulo: 'Treino', padrao: 'Treino', aviso: 'Hora do treino' },
  { valor: 'TRABALHO', rotulo: 'Trabalho', padrao: 'Trabalho', aviso: 'Começa o expediente' },
  { valor: 'SONO', rotulo: 'Sono', padrao: 'Dormir', aviso: 'Hora de dormir' },
  { valor: 'PAUSA', rotulo: 'Pausa', padrao: 'Pausa', aviso: 'Hora da pausa' },
  { valor: 'ESTUDO', rotulo: 'Estudo', padrao: 'Estudo', aviso: 'Hora de estudar' },
]

const PORTIPO = new Map(TIPOS.map((t) => [t.valor, t]))

/** O nome do bloco na tela: o que a pessoa escreveu, ou o do tipo. */
export function nomeDoBloco(bloco: Pick<RoutineBlock, 'kind' | 'title'>): string {
  return bloco.title?.trim() || (PORTIPO.get(bloco.kind)?.padrao ?? 'Bloco')
}

/** A frase do aviso. É ela que chega na tela bloqueada, então é curta. */
export function avisoDoBloco(bloco: Pick<RoutineBlock, 'kind' | 'title'>): string {
  const tipo = PORTIPO.get(bloco.kind)
  return bloco.title?.trim() || tipo?.aviso || 'Seu plano'
}

export function rotuloDoTipo(kind: RoutineKind): string {
  return PORTIPO.get(kind)?.rotulo ?? kind
}

/** Os dias em ISO: 1 é segunda, 7 é domingo — a mesma convenção do projeto. */
export const DIAS: ReadonlyArray<{ valor: number; letra: string; nome: string }> = [
  { valor: 1, letra: 'S', nome: 'segunda' },
  { valor: 2, letra: 'T', nome: 'terça' },
  { valor: 3, letra: 'Q', nome: 'quarta' },
  { valor: 4, letra: 'Q', nome: 'quinta' },
  { valor: 5, letra: 'S', nome: 'sexta' },
  { valor: 6, letra: 'S', nome: 'sábado' },
  { valor: 7, letra: 'D', nome: 'domingo' },
]

/** O dia ISO de uma data. `getDay()` é 0 no domingo; aqui domingo é 7. */
export function diaIso(data: Date): number {
  return data.getDay() === 0 ? 7 : data.getDay()
}

/**
 * "Todo dia", "Seg a Sex", "Seg, Qua e Sex".
 *
 * Os dois primeiros casos cobrem quase toda rotina real, e escrever
 * "Seg, Ter, Qua, Qui, Sex" para eles encheria o cartão de ruído.
 */
export function rotuloDosDias(dias: readonly number[]): string {
  const ordenados = [...new Set(dias)].sort((a, b) => a - b)
  if (ordenados.length === 7) return 'Todo dia'
  if (ordenados.length === 5 && ordenados.every((d) => d <= 5)) return 'Seg a Sex'
  if (ordenados.length === 2 && ordenados[0] === 6 && ordenados[1] === 7) return 'Fim de semana'

  const nomes = ordenados.map((d) => {
    const nome = DIAS.find((x) => x.valor === d)?.nome ?? ''
    return nome.slice(0, 3).replace(/^./, (c) => c.toUpperCase())
  })
  if (nomes.length === 1) return nomes[0]
  return `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}`
}

/** Os blocos de um dia, em ordem de relógio. */
export function blocosDoDia(
  blocos: readonly RoutineBlock[],
  dia: number,
): RoutineBlock[] {
  return blocos
    .filter((b) => b.days.includes(dia))
    .sort((a, b) => a.atTime.localeCompare(b.atTime))
}

/** 'HH:MM' do relógio local. */
export function horaAgora(agora = new Date()): string {
  return `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`
}

/**
 * O que está acontecendo agora, e o que vem depois.
 *
 * ── Por que "agora" é o último que já passou ────────────────────────────────
 *
 * Não existe duração nos blocos: eles são marcos, não intervalos. Então
 * "agora" é o marco mais recente que já aconteceu hoje — às 13h, com almoço às
 * 12h30 e água às 15h, o que está valendo é o almoço.
 *
 * Antes do primeiro bloco do dia, `atual` é nulo e só há `proximo`. Dizer que
 * às 5h da manhã a pessoa está no "jantar de ontem" seria pior que não dizer
 * nada.
 */
export function agoraEDepois(
  blocos: readonly RoutineBlock[],
  agora = new Date(),
): { atual: RoutineBlock | null; proximo: RoutineBlock | null } {
  const hoje = blocosDoDia(blocos, diaIso(agora))
  const hora = horaAgora(agora)

  const passados = hoje.filter((b) => b.atTime <= hora)
  const futuros = hoje.filter((b) => b.atTime > hora)

  return {
    atual: passados.at(-1) ?? null,
    /*
     * Sem bloco mais tarde hoje, o próximo é o primeiro do dia seguinte que
     * tiver algum — procurado até sete dias à frente, porque uma rotina só de
     * sábado existe e não pode devolver nulo numa segunda.
     */
    proximo: futuros[0] ?? proximoNosProximosDias(blocos, agora),
  }
}

function proximoNosProximosDias(
  blocos: readonly RoutineBlock[],
  agora: Date,
): RoutineBlock | null {
  for (let i = 1; i <= 7; i += 1) {
    const dia = ((diaIso(agora) - 1 + i) % 7) + 1
    const doDia = blocosDoDia(blocos, dia)
    if (doDia.length > 0) return doDia[0]
  }
  return null
}

/**
 * Quantos blocos de hoje já passaram, de 0 a 100.
 *
 * O anel do dia. Divisão por zero não acontece: sem bloco nenhum o resultado é
 * zero, e não `NaN` desenhando um anel vazio sem explicação.
 */
export function progressoDoDia(blocos: readonly RoutineBlock[], agora = new Date()): number {
  const hoje = blocosDoDia(blocos, diaIso(agora))
  if (hoje.length === 0) return 0
  const hora = horaAgora(agora)
  return Math.round((hoje.filter((b) => b.atTime <= hora).length / hoje.length) * 100)
}

/** Quantos blocos têm lembrete ligado — o número que a tela promete. */
export function quantosLembram(blocos: readonly RoutineBlock[]): number {
  return blocos.filter((b) => b.remind).length
}
