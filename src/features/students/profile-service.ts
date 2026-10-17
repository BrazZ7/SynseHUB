import 'server-only'

import { estanteDeConquistas, type Conquista } from '@/features/students/achievements'
import { nivelDe, type NivelSynse } from '@/features/students/level'
import { calcularSequencia, diaLocal, type Sequencia } from '@/features/students/streak'
import type { SessionContext } from '@/lib/auth/session'
import { getDataSource } from '@/lib/database'
import { isPendingMigration } from '@/lib/database/pending-migration'
import type { ChallengeMedal } from '@/types/domain'

/**
 * Tudo o que o perfil mostra, montado de uma vez.
 *
 * As consultas são paralelas e cada uma cai sozinha: a tela de perfil não pode
 * quebrar inteira porque a corrida ainda não foi migrada neste banco. O que
 * falta vira zero, e zero é um estado legítimo para quem está começando.
 */

export type RecordePessoal = { rotulo: string; valor: string }

export type DiaDaSemana = { rotulo: string; treinos: number }

export type PerfilCompleto = {
  totais: { treinos: number; quilometros: number; desafios: number; medalhas: number }
  nivel: NivelSynse
  sequencia: Sequencia
  maiorSequencia: number
  conquistas: Conquista[]
  medalhas: ChallengeMedal[]
  semana: DiaDaSemana[]
  ultimas4Semanas: {
    treinos: number
    quilometros: number
    minutos: number
    /** Variação contra as 4 semanas anteriores, em pontos percentuais. */
    consistencia: number | null
  }
  recordes: RecordePessoal[]
}

const DIA = 86_400_000
const ROTULOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

/** Erro previsto vira valor neutro; erro de verdade sobe. */
async function tolerante<T>(promessa: Promise<T>, vazio: T): Promise<T> {
  try {
    return await promessa
  } catch (erro) {
    if (isPendingMigration(erro)) return vazio
    throw erro
  }
}

export async function getPerfilCompleto(
  session: SessionContext & { studentId: string },
  fuso: string,
  agora = new Date(),
): Promise<PerfilCompleto> {
  const dataSource = await getDataSource()

  const quatroSemanas = new Date(agora.getTime() - 28 * DIA)
  const oitoSemanas = new Date(agora.getTime() - 56 * DIA)

  const [
    totaisRecentes,
    totaisAnteriores,
    totaisDeSempre,
    corridaDeSempre,
    corrida4Semanas,
    medalhas,
    recordesDeCorrida,
    recordesDeCarga,
    checkIns,
  ] = await Promise.all([
    tolerante(
      dataSource.getWorkoutTotals(session.studentId, quatroSemanas.toISOString(), agora.toISOString()),
      VAZIO_TREINO,
    ),
    tolerante(
      dataSource.getWorkoutTotals(
        session.studentId,
        oitoSemanas.toISOString(),
        quatroSemanas.toISOString(),
      ),
      VAZIO_TREINO,
    ),
    tolerante(
      dataSource.getWorkoutTotals(session.studentId, new Date(0).toISOString(), agora.toISOString()),
      VAZIO_TREINO,
    ),
    tolerante(
      dataSource.summarizeActivities(session.userProfileId, new Date(0).toISOString()),
      VAZIO_CORRIDA,
    ),
    tolerante(
      dataSource.summarizeActivities(session.userProfileId, quatroSemanas.toISOString()),
      VAZIO_CORRIDA,
    ),
    tolerante(dataSource.listChallengeMedals(session.userProfileId), [] as ChallengeMedal[]),
    tolerante(dataSource.listPersonalRecords(session.userProfileId), []),
    tolerante(dataSource.getPersonalRecords(session.studentId), []),
    tolerante(dataSource.listCheckInsForStudent(session.organizationId, session.studentId, 365), []),
  ])

  const quilometrosDeSempre = corridaDeSempre.distanceMeters / 1000
  const sequencia = calcularSequencia(checkIns, { fuso, agora })
  const maiorSequencia = maiorSequenciaDe(checkIns, fuso)

  const melhorCarga = recordesDeCarga.reduce((maior, r) => Math.max(maior, r.maxWeight ?? 0), 0)
  const maiorDistancia = recordesDeCorrida.reduce((maior, r) => Math.max(maior, r.distanceMeters), 0)
  const melhorPace = recordesDeCorrida.reduce<number | null>(
    (melhor, r) => (melhor === null || r.paceSeconds < melhor ? r.paceSeconds : melhor),
    null,
  )

  const desafiosConcluidos = medalhas.filter((m) => m.level !== 'PARTICIPACAO').length

  return {
    totais: {
      treinos: totaisDeSempre.workouts,
      quilometros: quilometrosDeSempre,
      desafios: desafiosConcluidos,
      medalhas: medalhas.length,
    },
    nivel: nivelDe({
      treinos: totaisDeSempre.workouts,
      quilometros: quilometrosDeSempre,
      medalhas: medalhas.length,
    }),
    sequencia,
    maiorSequencia,
    conquistas: estanteDeConquistas({
      treinos: totaisDeSempre.workouts,
      quilometros: quilometrosDeSempre,
      maiorSequencia,
      medalhas: medalhas.length,
      maiorCargaKg: melhorCarga,
      desafiosConcluidos,
    }),
    medalhas,
    semana: distribuicaoSemanal(checkIns, fuso, agora),
    ultimas4Semanas: {
      treinos: totaisRecentes.workouts,
      quilometros: corrida4Semanas.distanceMeters / 1000,
      minutos: Math.round(
        ((totaisRecentes.averageDurationSeconds ?? 0) * totaisRecentes.workouts +
          corrida4Semanas.movingSeconds) /
          60,
      ),
      consistencia: variacao(totaisAnteriores.workouts, totaisRecentes.workouts),
    },
    recordes: [
      {
        rotulo: 'Maior distância',
        valor: maiorDistancia > 0 ? `${(maiorDistancia / 1000).toFixed(1)} km` : '—',
      },
      { rotulo: 'Melhor pace', valor: melhorPace ? `${formatarPace(melhorPace)} /km` : '—' },
      { rotulo: 'Maior carga', valor: melhorCarga > 0 ? `${Math.round(melhorCarga)} kg` : '—' },
      {
        rotulo: 'Maior sequência',
        valor: maiorSequencia > 0 ? `${maiorSequencia} dias` : '—',
      },
    ],
  }
}

const VAZIO_TREINO = {
  workouts: 0,
  sets: 0,
  reps: 0,
  volumeKg: 0,
  averageDurationSeconds: null,
  averageRestSeconds: null,
  distinctExercises: 0,
}

const VAZIO_CORRIDA = {
  activities: 0,
  distanceMeters: 0,
  movingSeconds: 0,
  calories: 0,
  elevationGain: 0,
}

/**
 * A maior sequência já feita, não a de agora.
 *
 * A conquista de sete dias não pode sumir porque a pessoa faltou hoje: o que
 * ela fez, ela fez. A regra de ponte do fim de semana é a mesma da sequência
 * viva — quem treina de segunda a sexta encadeia semanas.
 */
function maiorSequenciaDe(checkIns: readonly { checkedInAt: string }[], fuso: string): number {
  const dias = [
    ...new Set(
      checkIns
        .map((c) => new Date(c.checkedInAt))
        .filter((d) => !Number.isNaN(d.getTime()))
        .map((d) => diaLocal(d, fuso)),
    ),
  ].sort()

  let maior = 0
  let atual = 0
  let anterior: string | null = null

  for (const dia of dias) {
    if (anterior === null) {
      atual = 1
    } else {
      atual = encadeia(anterior, dia) ? atual + 1 : 1
    }
    anterior = dia
    if (atual > maior) maior = atual
  }

  return maior
}

/** Dois dias de treino se encadeiam, atravessando sábado e domingo. */
function encadeia(anterior: string, atual: string): boolean {
  let cursor = anterior
  for (let i = 0; i < 5; i += 1) {
    cursor = somarDia(cursor)
    if (cursor === atual) return true
    const semana = new Date(`${cursor}T12:00:00Z`).getUTCDay()
    if (semana !== 0 && semana !== 6) return false
  }
  return false
}

function somarDia(dia: string): string {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/** Quantos treinos em cada dia da semana, nas últimas quatro. */
function distribuicaoSemanal(
  checkIns: readonly { checkedInAt: string }[],
  fuso: string,
  agora: Date,
): DiaDaSemana[] {
  const desde = agora.getTime() - 28 * DIA
  const contagem = [0, 0, 0, 0, 0, 0, 0]

  for (const c of checkIns) {
    const data = new Date(c.checkedInAt)
    if (Number.isNaN(data.getTime()) || data.getTime() < desde) continue
    contagem[new Date(`${diaLocal(data, fuso)}T12:00:00Z`).getUTCDay()] += 1
  }

  // Semana começando na segunda, como a pessoa conta.
  return [1, 2, 3, 4, 5, 6, 0].map((indice) => ({
    rotulo: ROTULOS[indice],
    treinos: contagem[indice],
  }))
}

/** Variação percentual entre dois períodos. Nulo quando não há base. */
function variacao(antes: number, depois: number): number | null {
  if (antes <= 0) return null
  return Math.round(((depois - antes) / antes) * 100)
}

function formatarPace(segundos: number): string {
  const min = Math.floor(segundos / 60)
  const seg = Math.round(segundos % 60)
  return `${min}'${String(seg).padStart(2, '0')}"`
}
