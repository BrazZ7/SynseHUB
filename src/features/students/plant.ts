import type { NivelSynse } from '@/features/students/level'

/**
 * A muda do perfil, e o que ela significa.
 *
 * ── Por que a planta carrega o nível ────────────────────────────────────────
 *
 * O cartão ao lado já diz "Nível 3" e "faltam 1.050 XP". É exato e é frio.
 * A planta diz a mesma coisa de um jeito que se entende sem ler: ela está
 * pequena, ela está maior, ela acendeu. Uma pessoa que abre o app uma vez por
 * semana não acompanha um número de quatro dígitos; ela percebe que a folha
 * cresceu desde o mês passado.
 *
 * Nada aqui é guardado. O estágio é função do nível, que é função do
 * histórico — apagar um cache não perde jardim nenhum.
 *
 * ── Os estágios ─────────────────────────────────────────────────────────────
 *
 * Cinco, e o último é a árvore da capa do perfil. Fecha o círculo: a arte que
 * está lá em cima, grande, é onde esta muda chega.
 *
 * As faixas são apertadas no começo e largas no fim porque a curva de XP é
 * assim. O nível 2 sai em nove treinos; o 12, em mais de cento e cinquenta.
 * Se as faixas fossem iguais, quase todo mundo ficaria preso no primeiro
 * estágio para sempre — que é o oposto do que a planta deveria fazer.
 */

export type ChaveDoEstagio = 'SEMENTE' | 'BROTO' | 'MUDA' | 'ARBUSTO' | 'ARVORE'

export type EstagioDaPlanta = {
  chave: ChaveDoEstagio
  nome: string
  /** O primeiro nível deste estágio. */
  nivelMinimo: number
  /** Uma linha sobre o que ele significa. */
  legenda: string
}

export const ESTAGIOS: readonly EstagioDaPlanta[] = [
  { chave: 'SEMENTE', nome: 'Semente', nivelMinimo: 1, legenda: 'Tudo começa aqui.' },
  { chave: 'BROTO', nome: 'Broto', nivelMinimo: 2, legenda: 'A primeira folha abriu.' },
  { chave: 'MUDA', nome: 'Muda', nivelMinimo: 4, legenda: 'Já tem raiz para segurar.' },
  {
    chave: 'ARBUSTO',
    nome: 'Arbusto',
    nivelMinimo: 7,
    legenda: 'Cresceu o bastante para dar sombra.',
  },
  { chave: 'ARVORE', nome: 'Árvore', nivelMinimo: 12, legenda: 'A árvore da capa é você.' },
] as const

/** O nível em que a planta está inteira. Depois dele só sobra o brilho. */
export const NIVEL_DA_ARVORE = ESTAGIOS[ESTAGIOS.length - 1]!.nivelMinimo

/**
 * O piso do vigor.
 *
 * Nível 1 não desenha uma planta quase invisível. Quem acabou de chegar é
 * exatamente quem não pode abrir o perfil e ver um painel apagado — o
 * enfeite vira cobrança. Ela começa viva e fica mais viva.
 */
const VIGOR_MINIMO = 0.45

export type Planta = {
  estagio: EstagioDaPlanta
  /** Nulo quando já é árvore. */
  proximo: EstagioDaPlanta | null
  /** Quantos níveis faltam para o próximo estágio. Zero quando não há próximo. */
  niveisParaOProximo: number
  /** 0 a 1, o caminho andado dentro do estágio atual. */
  progresso: number
  /** 0 a 1, o quanto a arte aparece: escala, brilho e partículas saem daqui. */
  vigor: number
}

export function estagioDoNivel(nivel: number): EstagioDaPlanta {
  const n = Math.max(1, Math.floor(nivel))
  let atual = ESTAGIOS[0]!
  for (const estagio of ESTAGIOS) {
    if (n >= estagio.nivelMinimo) atual = estagio
  }
  return atual
}

/**
 * O estado da planta para um nível.
 *
 * Recebe o `NivelSynse` inteiro, e não só o número, para usar o progresso
 * dentro do nível: assim a planta anda um pouco a cada treino, e não só na
 * virada. Quem treina hoje quer ver que alguma coisa se moveu hoje.
 */
export function plantaDoNivel(nivel: NivelSynse): Planta {
  const n = Math.max(1, Math.floor(nivel.nivel))
  const fracao = Math.min(1, Math.max(0, nivel.progresso))
  const exato = n + fracao

  const estagio = estagioDoNivel(n)
  const indice = ESTAGIOS.findIndex((e) => e.chave === estagio.chave)
  const proximo = ESTAGIOS[indice + 1] ?? null

  const progresso = proximo
    ? Math.min(
        1,
        Math.max(0, (exato - estagio.nivelMinimo) / (proximo.nivelMinimo - estagio.nivelMinimo)),
      )
    : 1

  /*
   * O vigor cresce pelo nível e não pelo estágio: sem isso a planta ficaria
   * idêntica durante os cinco níveis de um arbusto e daria um salto na
   * virada. Assim ela cresce um pouco toda semana.
   */
  const caminho = Math.min(1, (exato - 1) / (NIVEL_DA_ARVORE - 1))
  const vigor = VIGOR_MINIMO + (1 - VIGOR_MINIMO) * caminho

  return {
    estagio,
    proximo,
    niveisParaOProximo: proximo ? Math.max(0, Math.ceil(proximo.nivelMinimo - exato)) : 0,
    progresso,
    vigor,
  }
}
