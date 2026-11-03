import type {
  PresenceState,
  SquadMember,
  SquadPingKind,
  SquadSession,
} from '@/types/domain'

/**
 * ── A lógica do lobby, fora da tela ─────────────────────────────────────────
 *
 * Ordenação, rótulos e o ranking do grupo. Tudo função pura, porque é aqui que
 * mora a chance de errar de um jeito que ninguém vê: quem aparece no topo,
 * quem entra no ranking, e o que a tela escreve para quem não autorizou.
 */

/**
 * Quantas pessoas cabem num esquadrão.
 *
 * O mesmo número vive em `squad_limite()` (0068), que é quem **manda** — a
 * entrada é recusada lá. Aqui ele serve para a tela desenhar as vagas e
 * escrever "cabem mais 4", e `tests/db/esquadrao.test.ts` confere que os dois
 * continuam iguais. Dois números diferentes fariam a tela convidar para uma
 * vaga que o banco recusa.
 */
export const LIMITE_DO_ESQUADRAO = 8

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

/**
 * Os seis recados, e o que cada um diz na tela.
 *
 * Seis e não sessenta: a lista precisa caber numa linha de botões e ser lida
 * de relance. Cada um existe porque é uma frase que alguém manda no grupo de
 * mensagens hoje — e não porque "seria legal ter".
 */
export const RECADOS: ReadonlyArray<{
  valor: SquadPingKind
  /** O que o botão mostra. Curto, porque são seis lado a lado. */
  botao: string
  /** O que aparece na bolha, com o nome de quem mandou na frente. */
  frase: string
}> = [
  { valor: 'BORA', botao: 'Bora!', frase: 'Bora treinar?' },
  { valor: 'CHEGANDO', botao: 'Chegando', frase: 'Estou chegando!' },
  { valor: 'ATRASADO', botao: 'Atrasei', frase: 'Vou atrasar um pouco.' },
  { valor: 'HOJE_NAO', botao: 'Hoje não', frase: 'Hoje não vou conseguir.' },
  { valor: 'MANDOU_BEM', botao: 'Mandou bem', frase: 'Mandou bem! 👏' },
  { valor: 'TREINO_NOVO', botao: 'Treino novo', frase: 'Olha o treino que eu mandei.' },
]

/** A frase de um recado. Vazia para um tipo que a tela não conhece. */
export function fraseDoRecado(kind: SquadPingKind): string {
  return RECADOS.find((r) => r.valor === kind)?.frase ?? ''
}

/**
 * "agora", "há 12 min", "há 3 h".
 *
 * O relógio do recado é curto de propósito: ele vive doze horas, então nunca
 * precisa dizer dia. E "agora" abaixo de um minuto porque "há 0 min" é o
 * mesmo defeito do "0 min" do histórico — número verdadeiro que lê como erro.
 */
export function haQuantoTempo(iso: string, agora = new Date()): string {
  const minutos = Math.floor((agora.getTime() - new Date(iso).getTime()) / 60_000)
  if (minutos < 1) return 'agora'
  if (minutos < 60) return `há ${minutos} min`
  return `há ${Math.floor(minutos / 60)} h`
}

/**
 * Quantos estão prontos, e quem falta.
 *
 * "Pronto" é quem chegou ou já está treinando — a mesma régua de
 * `contarNaAcademia`, porque a barra de baixo e o número de cima não podem
 * discordar na mesma tela.
 *
 * `faltam` traz **no máximo dois nomes**: "aguardando Lucas" é informação,
 * "aguardando Lucas, Ana, Caio, Duda e mais 3" é uma lista que ninguém lê.
 */
export function prontidao(membros: readonly SquadMember[]): {
  prontos: number
  total: number
  faltam: string[]
  restantes: number
} {
  const estaPronto = (m: SquadMember) => m.presenca === 'CHEGUEI' || m.presenca === 'TREINANDO'
  /*
   * Você fica de fora da lista de quem falta. "Aguardando Sofia" para a
   * própria Sofia é a tela cobrando de quem está olhando — e ela já sabe, o
   * botão grande ao lado diz. Visto no navegador.
   */
  const pendentes = membros.filter((m) => !estaPronto(m) && !m.souEu)

  return {
    prontos: membros.filter(estaPronto).length,
    total: membros.length,
    faltam: pendentes.slice(0, 2).map((m) => m.nome.split(' ')[0]),
    restantes: Math.max(0, pendentes.length - 2),
  }
}

/**
 * "Sofia", "Sofia e Paulo", "Sofia, Paulo e mais 2".
 *
 * Dois nomes pedem "e"; três ou mais pedem vírgula antes do "e". Juntar tudo
 * com " e " dava "Sofia e Paulo e mais 1", com dois "e" na mesma frase —
 * visto no navegador antes desta função existir.
 */
export function listaDeNomes(nomes: readonly string[], restantes: number): string {
  const partes = [...nomes]
  if (restantes > 0) partes.push(`mais ${restantes}`)
  if (partes.length === 0) return ''
  if (partes.length === 1) return partes[0]
  return `${partes.slice(0, -1).join(', ')} e ${partes.at(-1)}`
}

/** As iniciais para o avatar, quando não há foto. */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase()
}
