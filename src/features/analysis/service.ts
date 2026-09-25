import 'server-only'

import {
  aderencia,
  compararTotais,
  constancia,
  evolucaoDaForca,
  recordesNoPeriodo,
  type Aderencia,
  type ComparacaoDeTotais,
  type Constancia,
  type EvolucaoDaForca,
  type RecordeDoPeriodo,
} from '@/features/analysis/metrics'
import { getDataSource } from '@/lib/database'
import { isPendingMigration } from '@/lib/database/pending-migration'
import { logger } from '@/lib/logger'
import type { WorkoutTotals } from '@/types/domain'

/**
 * ── A análise mensal ────────────────────────────────────────────────────────
 *
 * Junta o que o banco agrega com o que `metrics.ts` calcula. Nada é decidido
 * aqui: este arquivo busca, recorta e entrega. O julgamento — o que é bom, o
 * que é recuo — é da tela, que sabe o objetivo da pessoa.
 *
 * ── Por que 30 dias contra 30 dias, e não "mês contra mês" ──────────────────
 *
 * O Synse+ promete "análise comparada entre meses", mas comparar um mês pela
 * metade com um mês inteiro produz queda em todo dia 10. Duas janelas do mesmo
 * tamanho são sempre comparáveis, e a análise passa a valer em qualquer dia —
 * não só no primeiro do mês. A janela é parâmetro: quando a rotina mensal
 * existir, ela pode pedir mês fechado sem tocar neste arquivo.
 */

/** O tamanho padrão da janela, e da janela anterior contra a qual se compara. */
export const DIAS_DA_JANELA = 30

/**
 * O horizonte da curva de força — um trimestre, não o mês.
 *
 * Força não se move em trinta dias: o ganho inicial é neural e o resto é
 * lento. Uma curva de quatro semanas mostra ruído de dia bom e dia ruim, e
 * quem lê conclui que não evoluiu. O trimestre é onde a linha significa algo.
 */
export const SEMANAS_DE_FORCA = 12

/**
 * Quantos exercícios entram na curva de força.
 *
 * Cada um custa uma consulta, e uma tela com quinze linhas de evolução não se
 * lê. Três é o que cabe num cartão e cobre os levantamentos principais.
 */
export const EXERCICIOS_NA_ANALISE = 3

/**
 * Teto de sessões buscadas para medir constância.
 *
 * Duas janelas de 30 dias em quem treina todo dia dão 60. Duzentos é folga
 * larga o bastante para nunca cortar, e pequeno o bastante para não pesar.
 */
const SESSOES_BUSCADAS = 200

export type ForcaPorExercicio = {
  exerciseId: string
  exerciseName: string
  evolucao: EvolucaoDaForca
}

export type AnaliseMensal = {
  /**
   * Falso quando o schema ainda não tem as funções da 0026/0027, ou quando a
   * consulta falhou. A tela mostra o estado vazio em vez de quebrar — publicar
   * não é migrar, e entre um e outro o app continua de pé.
   */
  available: boolean
  janela: { de: string; ate: string; dias: number }
  totais: WorkoutTotals
  /** `null` quando não há janela anterior com treino — nada a comparar. */
  comparacao: ComparacaoDeTotais | null
  constancia: Constancia | null
  /** `null` sem nenhuma série prevista no período — nada a aderir. */
  aderencia: Aderencia | null
  /** Só os recordes que caíram dentro da janela. */
  recordes: RecordeDoPeriodo[]
  /** Vazio para quem ainda não tem duas semanas de carga no mesmo exercício. */
  forca: ForcaPorExercicio[]
}

const TOTAIS_VAZIOS: WorkoutTotals = {
  workouts: 0,
  sets: 0,
  reps: 0,
  volumeKg: 0,
  averageDurationSeconds: null,
  averageRestSeconds: null,
  distinctExercises: 0,
}

function vazia(janela: { de: Date; ate: Date }, available: boolean): AnaliseMensal {
  return {
    available,
    janela: {
      de: janela.de.toISOString(),
      ate: janela.ate.toISOString(),
      dias: Math.round((janela.ate.getTime() - janela.de.getTime()) / 86_400_000),
    },
    totais: TOTAIS_VAZIOS,
    comparacao: null,
    constancia: null,
    aderencia: null,
    recordes: [],
    forca: [],
  }
}

function recuarDias(referencia: Date, dias: number): Date {
  return new Date(referencia.getTime() - dias * 86_400_000)
}

/**
 * A análise da pessoa autenticada.
 *
 * `studentId` vem da sessão, nunca do cliente: `requireStudentSession` já o
 * resolveu no servidor, e a RLS ainda aplica por cima de cada consulta.
 */
export async function getAnaliseMensal(
  studentId: string,
  opcoes: { ate?: Date; dias?: number } = {},
): Promise<AnaliseMensal> {
  const ate = opcoes.ate ?? new Date()
  const dias = opcoes.dias ?? DIAS_DA_JANELA
  const de = recuarDias(ate, dias)
  const janela = { de, ate }
  const anterior = { de: recuarDias(de, dias), ate: de }

  try {
    const dataSource = await getDataSource()

    const [totais, totaisAnteriores, recordesTodos, sessoes, linhasDeAderencia] = await Promise.all(
      [
        dataSource.getWorkoutTotals(studentId, de.toISOString(), ate.toISOString()),
        dataSource.getWorkoutTotals(
          studentId,
          anterior.de.toISOString(),
          anterior.ate.toISOString(),
        ),
        dataSource.getPersonalRecords(studentId),
        dataSource.listWorkoutSessions(studentId, SESSOES_BUSCADAS),
        dataSource.getWorkoutAdherence(studentId, de.toISOString(), ate.toISOString()),
      ],
    )

    /*
     * Os exercícios da curva saem dos recordes mais recentes, e não dos mais
     * pesados. Ordenar por carga traria sempre leg press e terra, que são os
     * números grandes de qualquer ficha; ordenar por data traz o que a pessoa
     * está treinando agora, que é sobre o que ela quer ler.
     */
    const emFoco = recordesTodos
      .slice()
      .sort((a, b) => Date.parse(b.achievedAt) - Date.parse(a.achievedAt))
      .slice(0, EXERCICIOS_NA_ANALISE)

    const curvas = await Promise.all(
      emFoco.map(async (recorde) => ({
        recorde,
        pontos: await dataSource.getExerciseProgress(
          studentId,
          recorde.exerciseId,
          SEMANAS_DE_FORCA,
        ),
      })),
    )

    const forca = curvas.flatMap(({ recorde, pontos }) => {
      const evolucao = evolucaoDaForca(pontos)
      // Exercício com uma semana só de carga não vira linha — vide `metrics`.
      if (!evolucao) return []
      return [{ exerciseId: recorde.exerciseId, exerciseName: recorde.exerciseName, evolucao }]
    })

    /*
     * Sem treino no período anterior não há comparação: tudo apareceria como
     * crescimento infinito, que é o defeito que `variacao` já recusa produzir.
     * Aqui a recusa é mais cedo e mais clara — não há o que comparar.
     */
    const houveAnterior = totaisAnteriores.workouts > 0

    return {
      available: true,
      janela: { de: de.toISOString(), ate: ate.toISOString(), dias },
      totais,
      comparacao: houveAnterior ? compararTotais(totaisAnteriores, totais) : null,
      constancia: constancia(
        sessoes.map((sessao) => sessao.completedAt ?? sessao.startedAt),
        janela,
      ),
      aderencia: aderencia(linhasDeAderencia),
      recordes: recordesNoPeriodo(recordesTodos, janela),
      forca,
    }
  } catch (error) {
    if (isPendingMigration(error)) {
      logger.warn('analise:schema_pendente', { detalhe: 'Migrations 0026/0027 pendentes.' })
      return vazia(janela, false)
    }

    logger.error('analise:falhou', { error: String(error).slice(0, 300) })
    return vazia(janela, false)
  }
}
