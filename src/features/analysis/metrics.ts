/**
 * ── O motor da análise ──────────────────────────────────────────────────────
 *
 * A análise do Synse+ é conta, não adivinhação. Tudo aqui é função pura sobre
 * número que o banco já agregou (`getWorkoutTotals`, `getExerciseProgress`,
 * `getPersonalRecords`, criados na 0027) — nenhuma consulta, nenhuma rede,
 * nenhum modelo de linguagem.
 *
 * A separação importa por um motivo específico. Quando um dia a frase narrada
 * entrar — "sua força de empurrar subiu 12%" —, quem calcula os 12% é este
 * arquivo, e o modelo só escreve a frase em volta. Modelo de linguagem que
 * calcula devolve número plausível, que é coisa diferente de número certo, e
 * num app que fala de corpo isso não é detalhe de estilo.
 *
 * ── A regra que atravessa o arquivo ──────────────────────────────────────────
 *
 * **Sem base, devolve `null`.** É a mesma escolha de `metaDaSemana`: um número
 * inventado na primeira semana de uso é pior do que espaço vazio. Quem lê um
 * percentual acredita nele.
 */

import type {
  ExercisePersonalRecord,
  ExerciseProgressPoint,
  WorkoutTotals,
} from '@/types/domain'

const DIA_MS = 86_400_000

/**
 * Acima disto a estimativa de 1RM deixa de valer.
 *
 * As fórmulas de repetição máxima — Epley, Brzycki, todas — são ajustes
 * lineares calibrados em séries curtas. Numa série de 20 repetições o erro
 * passa de 10%, e o número deixa de significar o que promete. Doze é o corte
 * conservador que a literatura de prescrição usa.
 */
export const REPS_MAXIMAS_CONFIAVEIS = 12

/**
 * Carga máxima estimada para uma repetição (Epley: `carga × (1 + reps/30)`).
 *
 * Serve para comparar séries de tamanhos diferentes: 80 kg × 5 e 70 kg × 10
 * não se comparam de frente, mas 93 kg e 93 kg sim.
 *
 * Devolve `null` fora da faixa confiável em vez de um número com aparência de
 * precisão — inclusive para a série de uma repetição só, onde a fórmula não é
 * estimativa nenhuma: a carga já **é** o máximo, e é ela que volta.
 */
export function cargaMaximaEstimada(pesoKg: number, reps: number): number | null {
  if (!Number.isFinite(pesoKg) || !Number.isFinite(reps)) return null
  if (pesoKg <= 0 || reps <= 0) return null
  if (reps > REPS_MAXIMAS_CONFIAVEIS) return null

  const estimada = pesoKg * (1 + reps / 30)
  // Meio quilo é o menor incremento que existe numa academia.
  return Math.round(estimada * 2) / 2
}

/**
 * A diferença entre dois números, nas duas formas que uma tela precisa.
 *
 * `percentual` é `null` quando `antes` é zero, e não `Infinity` nem `100`:
 * quem saiu de zero não melhorou uma porcentagem, começou. Deixar o infinito
 * escapar para a tela imprime "Infinity%" no cartão — e arredondar para 100
 * seria mentir com cara de dado.
 */
export type Variacao = {
  antes: number
  depois: number
  delta: number
  percentual: number | null
}

export function variacao(antes: number, depois: number): Variacao {
  const validos = Number.isFinite(antes) && Number.isFinite(depois)
  if (!validos) return { antes: 0, depois: 0, delta: 0, percentual: null }

  const delta = depois - antes
  const percentual = antes === 0 ? null : Math.round((delta / Math.abs(antes)) * 1000) / 10

  return { antes, depois, delta, percentual }
}

/**
 * A evolução de carga num exercício, do começo ao fim da janela observada.
 *
 * Usa a carga máxima de cada semana direto, **sem** passar por Epley: o
 * `ExerciseProgressPoint` traz as repetições da semana inteira, não as da
 * série em que a carga máxima aconteceu, e aplicar a fórmula com o número
 * errado produziria uma estimativa que parece precisa e não é.
 *
 * Semana sem carga registrada não entra — treino de peso do corpo não derruba
 * a curva de quem também levanta peso.
 */
export type EvolucaoDaForca = {
  de: number
  para: number
  /** Semanas entre a primeira e a última medição, não semanas treinadas. */
  semanas: number
} & Variacao

export function evolucaoDaForca(
  pontos: readonly ExerciseProgressPoint[],
): EvolucaoDaForca | null {
  const comCarga = pontos
    .filter((ponto) => ponto.maxWeight != null && ponto.maxWeight > 0)
    .slice()
    .sort((a, b) => a.week.localeCompare(b.week))

  // Um ponto é uma foto, não uma evolução.
  if (comCarga.length < 2) return null

  const primeiro = comCarga[0]
  const ultimo = comCarga[comCarga.length - 1]

  const de = primeiro.maxWeight as number
  const para = ultimo.maxWeight as number

  const distancia = Date.parse(ultimo.week) - Date.parse(primeiro.week)
  const semanas = Number.isFinite(distancia) ? Math.round(distancia / (7 * DIA_MS)) : 0

  return { de, para, semanas, ...variacao(de, para) }
}

/**
 * Dois períodos lado a lado — o recorte que o Synse+ promete como "análise
 * comparada entre meses".
 *
 * Não resume em nota nem em veredito. Um mês com menos volume e mais carga é
 * progressão para quem está em força e recuo para quem está em hipertrofia, e
 * este arquivo não sabe em qual dos dois a pessoa está.
 */
export type ComparacaoDeTotais = {
  treinos: Variacao
  series: Variacao
  repeticoes: Variacao
  volumeKg: Variacao
  exerciciosDistintos: Variacao
  /** `null` quando algum dos dois períodos não tem duração registrada. */
  duracaoMediaSegundos: Variacao | null
}

export function compararTotais(
  anterior: WorkoutTotals,
  atual: WorkoutTotals,
): ComparacaoDeTotais {
  const duracaoComparavel =
    anterior.averageDurationSeconds != null && atual.averageDurationSeconds != null

  return {
    treinos: variacao(anterior.workouts, atual.workouts),
    series: variacao(anterior.sets, atual.sets),
    repeticoes: variacao(anterior.reps, atual.reps),
    volumeKg: variacao(anterior.volumeKg, atual.volumeKg),
    exerciciosDistintos: variacao(anterior.distinctExercises, atual.distinctExercises),
    duracaoMediaSegundos: duracaoComparavel
      ? variacao(anterior.averageDurationSeconds!, atual.averageDurationSeconds!)
      : null,
  }
}

/**
 * Constância: o número que prevê resultado melhor do que qualquer carga.
 *
 * `maiorIntervaloDias` conta também o tempo entre o último treino e o fim da
 * janela. Sem isso, quem treinou forte por três semanas e sumiu na quarta
 * aparece com intervalo pequeno e média boa — exatamente a pessoa que o
 * relatório precisa enxergar.
 */
export type Constancia = {
  treinos: number
  /** Dias da janela observada, usados para a média. */
  dias: number
  /** Treinos por semana na janela. Zero treinos devolve zero, não `null`. */
  mediaSemanal: number
  maiorIntervaloDias: number
  /** Dias desde o último treino até o fim da janela. `null` sem treino algum. */
  diasSemTreinar: number | null
}

export function constancia(
  datasISO: readonly string[],
  janela: { de: Date; ate: Date },
): Constancia | null {
  const inicio = janela.de.getTime()
  const fim = janela.ate.getTime()
  if (!Number.isFinite(inicio) || !Number.isFinite(fim) || fim <= inicio) return null

  const dias = Math.round((fim - inicio) / DIA_MS)

  const marcas = datasISO
    .map((iso) => Date.parse(iso))
    .filter((ms) => Number.isFinite(ms) && ms >= inicio && ms <= fim)
    .sort((a, b) => a - b)

  if (marcas.length === 0) {
    return {
      treinos: 0,
      dias,
      mediaSemanal: 0,
      // A janela inteira é um intervalo sem treino — é o que ela é.
      maiorIntervaloDias: dias,
      diasSemTreinar: null,
    }
  }

  /*
   * O primeiro intervalo é o do começo da janela até o primeiro treino, e o
   * último é do último treino até o fim. Contar só os intervalos entre
   * treinos esconderia quem começou tarde ou parou cedo.
   */
  let maiorMs = marcas[0] - inicio
  for (let i = 1; i < marcas.length; i += 1) {
    maiorMs = Math.max(maiorMs, marcas[i] - marcas[i - 1])
  }
  const desdeOUltimo = fim - marcas[marcas.length - 1]
  maiorMs = Math.max(maiorMs, desdeOUltimo)

  return {
    treinos: marcas.length,
    dias,
    mediaSemanal: Math.round((marcas.length / (dias / 7)) * 10) / 10,
    maiorIntervaloDias: Math.round(maiorMs / DIA_MS),
    diasSemTreinar: Math.round(desdeOUltimo / DIA_MS),
  }
}

/**
 * Os recordes que caíram na janela.
 *
 * `getPersonalRecords` devolve o recorde vigente de cada exercício, sem dizer
 * se ele é novo. Quem quebrou três recordes no mês merece ler isso, e quem
 * carrega um recorde de 2024 não deve lê-lo como conquista deste mês.
 *
 * A carga estimada vem junto quando a série está na faixa confiável — é ela
 * que permite comparar o recorde de 5 repetições com o de 10.
 */
export type RecordeDoPeriodo = ExercisePersonalRecord & {
  cargaMaximaEstimada: number | null
}

export function recordesNoPeriodo(
  recordes: readonly ExercisePersonalRecord[],
  janela: { de: Date; ate: Date },
): RecordeDoPeriodo[] {
  const inicio = janela.de.getTime()
  const fim = janela.ate.getTime()

  return recordes
    .filter((recorde) => {
      const quando = Date.parse(recorde.achievedAt)
      return Number.isFinite(quando) && quando >= inicio && quando <= fim
    })
    .map((recorde) => ({
      ...recorde,
      cargaMaximaEstimada: cargaMaximaEstimada(recorde.maxWeight, recorde.reps),
    }))
    .sort((a, b) => Date.parse(b.achievedAt) - Date.parse(a.achievedAt))
}
