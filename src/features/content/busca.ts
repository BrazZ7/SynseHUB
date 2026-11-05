/**
 * ── A regra de casamento da busca ───────────────────────────────────────────
 *
 * Em produção quem busca é o banco (`casa_termo`, 0067), com `unaccent`. Este
 * arquivo existe pelo mesmo motivo que `semana.ts`: a demonstração não tem
 * banco, e sem isto a busca seria a única parte do acervo que não funciona
 * lá — justamente a que alguém testando o produto vai querer experimentar.
 *
 * É duplicação, e ela tem teste próprio: os mesmos pares (texto, termo) passam
 * pelo SQL e por aqui, e as duas respostas têm de ser iguais. Se divergirem, o
 * teste cai antes de a demonstração mentir sobre o que o produto faz.
 */

/** Sem acento e em minúsculas — a mesma normalização da busca de exercícios. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Cada palavra do termo precisa aparecer em algum lugar do texto.
 *
 * Cada palavra, e não o termo inteiro: é o que faz "treino casa" encontrar
 * "Treino em casa sem equipamento". Com o termo inteiro, só acharia quem
 * digitasse as palavras grudadas e na ordem — que não é como ninguém procura.
 *
 * Termo vazio casa com tudo, como em `search_exercises`: assim a tela tem um
 * caminho só, com ou sem busca.
 */
export function casaTermo(texto: string, termo: string): boolean {
  const alvo = normalizar(texto)
  return normalizar(termo)
    .split(' ')
    .filter((palavra) => palavra !== '')
    .every((palavra) => alvo.includes(palavra))
}
