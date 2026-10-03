import { MUSCLE_GROUP_LABELS, MUSCLE_TARGET_LABELS } from '@/features/workouts/labels'
import type { Exercise } from '@/types/domain'

/**
 * ── A busca que faltava ─────────────────────────────────────────────────────
 *
 * A 0021 entrou com 132 exercícios e, em cada um, os apelidos que o mesmo
 * movimento tem conforme a região do Brasil — puxada frontal é pulley frente,
 * voador é peck deck, remada baixa é cavalinho. A migration explicou para quê:
 *
 *   "Sem isso, quem digita o nome que aprendeu não acha o exercício e conclui
 *    que ele não existe."
 *
 * Os apelidos ficaram no banco e **nenhuma tela os usava**. A lista era um
 * `<select>` de 132 opções agrupadas, sem campo de texto: quem procurava
 * cadeira extensora tinha que rolar até "Inferiores · Quadríceps" e achar com
 * o olho. O dono do produto procurou, não achou, e concluiu exatamente o que a
 * migration previu — que o exercício não estava lá.
 *
 * ── O que casa ───────────────────────────────────────────────────────────────
 *
 * Nome, apelidos, o aparelho como se fala na academia ("cadeira extensora",
 * "graviton") e o músculo. O músculo entra porque "peito" é uma busca que
 * qualquer professor tenta, e devolver vazio para ela seria repetir o defeito
 * num campo novo.
 *
 * Acento não conta: quem digita "biceps" com pressa acha "Bíceps". Cada palavra
 * do termo precisa casar em algum lugar, então "supino incl" chega em "Supino
 * inclinado com halteres" sem exigir a frase inteira.
 */

/** Sem acento e em minúsculas — "abdução" e "abducao" viram a mesma coisa. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Onde a busca procura, em ordem de força do sinal.
 *
 * Separado do exercício porque a ordem importa para a nota: casar no nome vale
 * mais que casar no aparelho, e um `includes` sobre tudo junto perderia essa
 * diferença.
 */
function camposDe(exercicio: Exercise) {
  const musculo = exercicio.primaryMuscle
    ? MUSCLE_TARGET_LABELS[exercicio.primaryMuscle]
    : MUSCLE_GROUP_LABELS[exercicio.muscleGroup]

  return {
    nome: normalizar(exercicio.name),
    apelidos: exercicio.aliases.map(normalizar),
    resto: [exercicio.equipment ?? '', musculo, MUSCLE_GROUP_LABELS[exercicio.muscleGroup]]
      .filter(Boolean)
      .map(normalizar),
  }
}

/**
 * A nota de um exercício para o termo. Menor é melhor; `null` não casa.
 *
 * A escada existe para o caso concreto: digitar "supino" tem que trazer o
 * supino reto antes do crucifixo que só casa por ser de peito. Sem a escada,
 * os dois empatariam e a ordem alfabética decidiria.
 */
function nota(exercicio: Exercise, termo: string): number | null {
  const campos = camposDe(exercicio)
  const palavras = termo.split(/\s+/).filter(Boolean)
  if (palavras.length === 0) return null

  if (campos.nome.startsWith(termo)) return 0
  if (campos.nome.includes(termo)) return 1
  if (campos.apelidos.some((apelido) => apelido.startsWith(termo))) return 2
  if (campos.apelidos.some((apelido) => apelido.includes(termo))) return 3

  /*
   * Último degrau: cada palavra do termo casa em algum lugar, nem que seja em
   * campos diferentes. É o que faz "extensora unilateral" funcionar quando uma
   * das palavras está no nome e a outra não.
   */
  const tudo = [campos.nome, ...campos.apelidos, ...campos.resto]
  const todasCasam = palavras.every((palavra) =>
    tudo.some((campo) => campo.includes(palavra)),
  )

  return todasCasam ? 4 : null
}

/**
 * Filtra e ordena a biblioteca para o termo digitado.
 *
 * Termo vazio devolve vazio, e não a lista inteira: quem não digitou nada
 * continua vendo a lista agrupada por região e músculo, que é melhor para
 * escolher do que 132 linhas em ordem de nota.
 */
export function buscarExercicios(
  exercicios: readonly Exercise[],
  termo: string,
  limite = 30,
): Exercise[] {
  const alvo = normalizar(termo)
  if (!alvo) return []

  const comNota: Array<{ exercicio: Exercise; nota: number }> = []
  for (const exercicio of exercicios) {
    const n = nota(exercicio, alvo)
    if (n !== null) comNota.push({ exercicio, nota: n })
  }

  return comNota
    .sort(
      (a, b) =>
        a.nota - b.nota ||
        // Empatados, o básico vem primeiro: é o que sustenta o treino, e quem
        // monta ficha começa por ele.
        Number(b.exercicio.utility === 'BASIC') - Number(a.exercicio.utility === 'BASIC') ||
        a.exercicio.name.localeCompare(b.exercicio.name, 'pt-BR'),
    )
    .slice(0, limite)
    .map((linha) => linha.exercicio)
}
