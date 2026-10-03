/**
 * O nível Synse.
 *
 * ── Derivado, não guardado ──────────────────────────────────────────────────
 *
 * Não existe tabela de XP no banco, e esta função não finge que existe: o
 * número sai do trabalho que a pessoa já fez — treinos concluídos,
 * quilômetros percorridos, medalhas conquistadas. É determinístico e
 * reconstruível: apagar um cache não perde nada, e dois lugares que somem o
 * mesmo histórico chegam ao mesmo nível.
 *
 * A alternativa seria um livro-razão de XP, com uma linha por evento. Ele é
 * necessário no dia em que o XP vier de coisas que não deixam rastro próprio
 * (abrir o app, completar um tutorial, indicar um amigo) — aí o valor deixa de
 * ser função do histórico e precisa ser lembrado. Até lá, isto é mais simples
 * e mais difícil de ficar errado.
 *
 * ── Os pesos ────────────────────────────────────────────────────────────────
 *
 * Um treino vale mais que um quilômetro porque exige ir até a academia. Uma
 * medalha vale bem mais que os dois porque representa um mês inteiro de
 * constância. Os números são redondos de propósito: alguém precisa conseguir
 * explicar o próprio nível sem abrir o código.
 */

export const XP_POR_TREINO = 100
export const XP_POR_QUILOMETRO = 10
export const XP_POR_MEDALHA = 250

/**
 * Quanto o nível N exige para virar o N+1.
 *
 * Cresce cem a cada nível: o começo é rápido, para quem chega ver movimento,
 * e vai pesando, para o nível alto significar alguma coisa.
 */
export function xpDoNivel(nivel: number): number {
  return 800 + Math.max(1, nivel) * 100
}

export type NivelSynse = {
  nivel: number
  /** XP acumulado dentro do nível atual, não no total. */
  xpNoNivel: number
  /** Quanto o nível atual exige. */
  xpDoNivel: number
  /** Quanto falta para o próximo. */
  falta: number
  /** 0 a 1, para a barra. */
  progresso: number
  xpTotal: number
}

export type FonteDeXp = {
  treinos: number
  quilometros: number
  medalhas: number
}

export function calcularXp(fonte: FonteDeXp): number {
  return Math.max(
    0,
    Math.round(
      fonte.treinos * XP_POR_TREINO +
        fonte.quilometros * XP_POR_QUILOMETRO +
        fonte.medalhas * XP_POR_MEDALHA,
    ),
  )
}

/**
 * De XP total para nível.
 *
 * Desconta banda por banda em vez de usar fórmula fechada: a conta fica óbvia
 * de ler e de conferir, e o laço roda poucas dezenas de vezes mesmo para quem
 * treina há anos.
 */
export function calcularNivel(xpTotal: number): NivelSynse {
  const total = Math.max(0, Math.floor(xpTotal))
  let nivel = 1
  let restante = total

  /*
   * O teto entra na condição, e não num `break` depois de incrementar: assim
   * o nível para *em* 500 em vez de sair em 501. Sem ele, um valor absurdo
   * vindo de dado corrompido prenderia a renderização — e a tela de perfil é a
   * última que deveria travar por causa de um número.
   */
  const TETO = 500
  while (nivel < TETO && restante >= xpDoNivel(nivel)) {
    restante -= xpDoNivel(nivel)
    nivel += 1
  }

  const banda = xpDoNivel(nivel)
  return {
    nivel,
    xpNoNivel: restante,
    xpDoNivel: banda,
    falta: Math.max(0, banda - restante),
    progresso: banda > 0 ? Math.min(1, restante / banda) : 0,
    xpTotal: total,
  }
}

export function nivelDe(fonte: FonteDeXp): NivelSynse {
  return calcularNivel(calcularXp(fonte))
}
