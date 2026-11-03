import type { PresenceState, SquadMember, SquadSession } from '@/types/domain'

/**
 * ── A lógica do lobby, fora da tela ─────────────────────────────────────────
 *
 * Ordenação, rótulos e o ranking do grupo. Tudo função pura, porque é aqui que
 * mora a chance de errar de um jeito que ninguém vê: quem aparece no topo,
 * quem entra no ranking, e o que a tela escreve para quem não autorizou.
 */

/**
 * O vocabulário fechado do lobby.
 *
 * Quatro estados e nada de texto livre. A razão está na 0068: um grupo que se
 * forma por código é gente que pode não se conhecer, e academia tem aluno
 * menor de idade. Sem denúncia, sem bloqueio e sem quem leia, texto livre é
 * superfície de moderação que este produto não sustenta.
 */
export const PRESENCAS: ReadonlyArray<{
  valor: PresenceState
  rotulo: string
  curto: string
}> = [
  { valor: 'A_CAMINHO', rotulo: 'Estou a caminho', curto: 'A caminho' },
  { valor: 'CHEGUEI', rotulo: 'Cheguei na academia', curto: 'Chegou' },
  { valor: 'TREINANDO', rotulo: 'Treinando agora', curto: 'Treinando' },
  { valor: 'TERMINEI', rotulo: 'Terminei o treino', curto: 'Terminou' },
]

/** O rótulo curto de um estado, ou `null` para quem não avisou nada. */
export function rotuloDaPresenca(estado: PresenceState | null | undefined): string | null {
  return PRESENCAS.find((p) => p.valor === estado)?.curto ?? null
}

/**
 * Quem está "na academia agora", para o número grande do cartão.
 *
 * `CHEGUEI` e `TREINANDO`, e não os quatro: quem está a caminho ainda não
 * chegou, e quem terminou já foi. Contar os quatro faria o cartão dizer
 * "4 na academia" com o grupo inteiro em casa.
 */
export function contarNaAcademia(membros: readonly SquadMember[]): number {
  return membros.filter((m) => m.presenca === 'CHEGUEI' || m.presenca === 'TREINANDO').length
}

/** Peso de cada estado na ordenação: quem está lá aparece primeiro. */
const PESO: Record<PresenceState, number> = {
  TREINANDO: 0,
  CHEGUEI: 1,
  A_CAMINHO: 2,
  TERMINEI: 3,
}

/**
 * A ordem do lobby: quem está mais perto do treino, primeiro.
 *
 * O banco devolve por papel e nome, que é a ordem de uma lista de membros. O
 * lobby é outra pergunta — "quem está lá agora" —, e a resposta tem de estar
 * no topo sem rolagem. Empate volta para o nome, que é estável.
 *
 * Você não vem primeiro: o seu cartão é o botão grande acima da lista, e
 * repetir-se no topo ocuparia a linha de quem a pessoa abriu o app para ver.
 */
export function ordenarLobby(membros: readonly SquadMember[]): SquadMember[] {
  return [...membros].sort((a, b) => {
    const pa = a.presenca ? PESO[a.presenca] : 9
    const pb = b.presenca ? PESO[b.presenca] : 9
    return pa - pb || a.nome.localeCompare(b.nome, 'pt-BR')
  })
}

/**
 * O ranking da semana do esquadrão.
 *
 * Só quem tem número — isto é, você e quem autorizou (0037). Quem não
 * autorizou **não entra na lista e não vira uma linha vazia**: a tela diz, em
 * uma frase embaixo, quantos escolheram não aparecer. Mostrar o nome com um
 * traço no lugar do número é uma forma de cobrar publicamente por uma escolha
 * privada.
 */
export function rankingDaSemana(membros: readonly SquadMember[]): SquadMember[] {
  return membros
    .filter((m) => m.diasNaSemana !== null)
    .sort((a, b) => (b.diasNaSemana ?? 0) - (a.diasNaSemana ?? 0) || a.nome.localeCompare(b.nome, 'pt-BR'))
}

/** Quantos preferiram não aparecer no ranking. */
export function foraDoRanking(membros: readonly SquadMember[]): number {
  return membros.filter((m) => m.diasNaSemana === null).length
}

/**
 * O próximo treino marcado que ainda vale.
 *
 * Cancelado não conta, e passado também não — mas a lista mostra o de ontem,
 * então o filtro precisa estar aqui e não só na consulta.
 */
export function proximoTreino(
  sessoes: readonly SquadSession[],
  agora = new Date(),
): SquadSession | null {
  return (
    sessoes
      .filter((s) => !s.cancelado && new Date(s.startsAt) >= agora)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0] ?? null
  )
}

/**
 * "Hoje às 19h", "amanhã às 7h", "quinta, 06/11 às 19h".
 *
 * Hoje e amanhã por extenso porque é assim que alguém combina treino. Daí em
 * diante entra a data, senão "sexta" vira ambíguo na semana seguinte.
 */
export function quando(iso: string, agora = new Date()): string {
  const data = new Date(iso)
  const dia = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

  const amanha = new Date(agora)
  amanha.setDate(amanha.getDate() + 1)

  const hora = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  /*
   * "19h" quando é hora cheia, "19:30" quando não é — como se fala. E sem o
   * zero à esquerda: "às 07h" é formato de tabela, "às 7h" é o que a pessoa
   * escreveria no grupo de mensagens.
   */
  const horaCurta = hora.endsWith(':00') ? `${Number(hora.slice(0, 2))}h` : hora

  if (dia(data) === dia(agora)) return `Hoje às ${horaCurta}`
  if (dia(data) === dia(amanha)) return `Amanhã às ${horaCurta}`

  const semana = data.toLocaleDateString('pt-BR', { weekday: 'long' })
  const curta = data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  return `${semana}, ${curta} às ${horaCurta}`
}

/** As iniciais para o avatar, quando não há foto. */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase()
}
