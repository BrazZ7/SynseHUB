import { describe, expect, it } from 'vitest'

import {
  criarSessao,
  duracaoEfetiva,
  ehUltimaSerie,
  progresso,
  reduzir,
  reidratar,
  repsIniciais,
  restanteDoDescanso,
  resumo,
} from '@/features/active-workout/engine/workout-engine'
import type { PlannedExercise, WorkoutSession } from '@/features/active-workout/engine/types'

/**
 * A máquina de estados do treino.
 *
 * O caso principal do pedido é o supino: 4 × 10, 70 kg, 90 s. Ele está inteiro
 * aqui, do início ao resumo, e em volta dele as bordas que quebram treino de
 * verdade — toque duplo, app em segundo plano, descanso que venceu sozinho.
 *
 * Nenhum teste espera tempo real passar: o engine recebe `agora`, então dez
 * minutos de descanso são uma soma.
 */

const T0 = new Date('2026-09-16T20:30:00Z').getTime()
const s = (n: number) => n * 1000

const supino: PlannedExercise = {
  exerciseId: 'ex-supino',
  workoutExerciseId: 'we-1',
  name: 'Supino reto',
  sets: 4,
  reps: '10',
  restSeconds: 90,
  suggestedLoad: 70,
  notes: null,
}
const inclinado: PlannedExercise = {
  exerciseId: 'ex-inclinado',
  workoutExerciseId: 'we-2',
  name: 'Supino inclinado',
  sets: 3,
  reps: '12',
  restSeconds: 60,
  suggestedLoad: 50,
  notes: null,
}

const novo = (exercicios = [supino, inclinado]) =>
  criarSessao({
    clientId: 'sess-1',
    workoutPlanId: 'plan-1',
    planName: 'Peito + Tríceps',
    exercises: exercicios,
    agora: T0,
  })

/** Conclui a série em curso e devolve a sessão resultante. */
const concluir = (sessao: WorkoutSession, agora: number, id = `set-${sessao.completedSets.length}`) =>
  reduzir(sessao, { type: 'COMPLETE_SET', agora, clientId: id })

describe('abertura do treino', () => {
  it('começa parado e entra na primeira série com a carga sugerida', () => {
    let sessao = novo()
    expect(sessao.state).toBe('NOT_STARTED')

    sessao = reduzir(sessao, { type: 'START', agora: T0 })
    expect(sessao.state).toBe('ACTIVE_SET')
    expect(sessao.setNumber).toBe(1)
    expect(sessao.currentWeight).toBe(70)
    expect(sessao.currentReps).toBe(10)
  })

  it('reps prescritas em faixa começam no menor valor', () => {
    expect(repsIniciais('8-12')).toBe(8)
    expect(repsIniciais('10')).toBe(10)
    // "até a falha" não tem número: 10 é o palpite menos surpreendente.
    expect(repsIniciais('até a falha')).toBe(10)
  })
})

describe('o caso principal: supino 4 × 10, 70 kg, 90 s', () => {
  it('percorre as quatro séries com descanso entre elas', () => {
    let sessao = reduzir(novo(), { type: 'START', agora: T0 })
    let agora = T0

    for (let serie = 1; serie <= 4; serie += 1) {
      expect(sessao.state).toBe('ACTIVE_SET')
      expect(sessao.setNumber).toBe(serie)

      agora += s(45)
      sessao = concluir(sessao, agora, `set-${serie}`)

      if (serie < 4) {
        expect(sessao.state).toBe('RESTING')
        expect(restanteDoDescanso(sessao, agora)).toBe(90)

        agora += s(90)
        sessao = reduzir(sessao, { type: 'REST_ELAPSED', agora })
        expect(sessao.state).toBe('REST_FINISHED')

        sessao = reduzir(sessao, { type: 'NEXT_SET', agora })
      }
    }

    // Quatro séries feitas: o exercício acabou, o treino não.
    expect(sessao.state).toBe('EXERCISE_COMPLETED')
    expect(sessao.completedSets).toHaveLength(4)
    expect(sessao.completedSets.map((x) => x.setNumber)).toEqual([1, 2, 3, 4])
    expect(sessao.completedSets.every((x) => x.weight === 70 && x.repsCompleted === 10)).toBe(true)
  })

  it('cada série registra exercício, número, reps, carga, horário e duração', () => {
    let sessao = reduzir(novo(), { type: 'START', agora: T0 })
    sessao = concluir(sessao, T0 + s(42), 'set-1')

    const serie = sessao.completedSets[0]
    expect(serie).toMatchObject({
      exerciseId: 'ex-supino',
      setNumber: 1,
      repsPlanned: 10,
      repsCompleted: 10,
      weight: 70,
      restSeconds: 90,
      startedAt: T0,
      completedAt: T0 + s(42),
    })
    // A duração da série sai da diferença, não de um campo à parte.
    expect(serie.completedAt - serie.startedAt).toBe(s(42))
  })

  it('o último exercício fecha o treino', () => {
    let sessao = reduzir(novo([supino]), { type: 'START', agora: T0 })
    let agora = T0

    for (let serie = 1; serie <= 4; serie += 1) {
      agora += s(40)
      sessao = concluir(sessao, agora, `set-${serie}`)
      if (serie < 4) {
        agora += s(90)
        sessao = reduzir(sessao, { type: 'REST_ELAPSED', agora })
        sessao = reduzir(sessao, { type: 'NEXT_SET', agora })
      }
    }

    expect(sessao.state).toBe('WORKOUT_COMPLETED')
    expect(sessao.finishedAt).toBe(agora)
  })
})

describe('edição rápida antes de concluir', () => {
  it('ajusta reps e carga, e é o valor ajustado que fica gravado', () => {
    let sessao = reduzir(novo(), { type: 'START', agora: T0 })
    sessao = reduzir(sessao, { type: 'ADJUST_REPS', delta: 2 })
    sessao = reduzir(sessao, { type: 'ADJUST_WEIGHT', delta: 2.5 })
    sessao = concluir(sessao, T0 + s(40), 'set-1')

    expect(sessao.completedSets[0]).toMatchObject({ repsCompleted: 12, weight: 72.5 })
    // O planejado continua guardado ao lado do feito.
    expect(sessao.completedSets[0].repsPlanned).toBe(10)
  })

  it('reps não desce de 1 e carga não fica negativa', () => {
    let sessao = reduzir(novo(), { type: 'START', agora: T0 })
    for (let i = 0; i < 20; i += 1) sessao = reduzir(sessao, { type: 'ADJUST_REPS', delta: -1 })
    for (let i = 0; i < 40; i += 1) sessao = reduzir(sessao, { type: 'ADJUST_WEIGHT', delta: -5 })

    expect(sessao.currentReps).toBe(1)
    // Peso corporal existe, então o piso da carga é zero — não 1.
    expect(sessao.currentWeight).toBe(0)
  })
})

describe('descanso', () => {
  it('+30 s empurra o fim, e o restante acompanha', () => {
    let sessao = reduzir(novo(), { type: 'START', agora: T0 })
    sessao = concluir(sessao, T0, 'set-1')
    expect(restanteDoDescanso(sessao, T0)).toBe(90)

    sessao = reduzir(sessao, { type: 'ADD_REST', segundos: 30 })
    expect(restanteDoDescanso(sessao, T0)).toBe(120)
  })

  it('−30 s nunca produz descanso vencido no passado', () => {
    let sessao = reduzir(novo(), { type: 'START', agora: T0 })
    sessao = concluir(sessao, T0, 'set-1')
    // Três vezes −30 s num descanso de 90 s chegaria a zero; quatro passaria.
    for (let i = 0; i < 4; i += 1) sessao = reduzir(sessao, { type: 'ADD_REST', segundos: -30 })

    expect(sessao.restEndsAt!).toBeGreaterThanOrEqual(sessao.restStartedAt!)
    expect(restanteDoDescanso(sessao, T0)).toBe(0)
  })

  it('pular vai direto para a próxima série', () => {
    let sessao = reduzir(novo(), { type: 'START', agora: T0 })
    sessao = concluir(sessao, T0, 'set-1')
    sessao = reduzir(sessao, { type: 'SKIP_REST', agora: T0 + s(10) })

    expect(sessao.state).toBe('REST_FINISHED')
    sessao = reduzir(sessao, { type: 'NEXT_SET', agora: T0 + s(10) })
    expect(sessao.state).toBe('ACTIVE_SET')
    expect(sessao.setNumber).toBe(2)
  })

  it('o descanso não termina antes da hora', () => {
    let sessao = reduzir(novo(), { type: 'START', agora: T0 })
    sessao = concluir(sessao, T0, 'set-1')
    sessao = reduzir(sessao, { type: 'REST_ELAPSED', agora: T0 + s(89) })
    expect(sessao.state).toBe('RESTING')
  })

  it('com descanso automático desligado, a próxima série começa na hora', () => {
    let sessao = reduzir(novo(), { type: 'START', agora: T0 })
    sessao = reduzir(sessao, { type: 'SETTINGS', settings: { autoRest: false } })
    sessao = concluir(sessao, T0 + s(40), 'set-1')

    expect(sessao.state).toBe('ACTIVE_SET')
    expect(sessao.setNumber).toBe(2)
    expect(sessao.restEndsAt).toBeNull()
  })

  it('com avanço automático, o fim do descanso já entra na série seguinte', () => {
    let sessao = reduzir(novo(), { type: 'START', agora: T0 })
    sessao = reduzir(sessao, { type: 'SETTINGS', settings: { autoAdvance: true } })
    sessao = concluir(sessao, T0, 'set-1')
    sessao = reduzir(sessao, { type: 'REST_ELAPSED', agora: T0 + s(90) })

    expect(sessao.state).toBe('ACTIVE_SET')
    expect(sessao.setNumber).toBe(2)
  })
})

describe('o toque duplo', () => {
  it('a mesma série não entra duas vezes', () => {
    /*
     * Mão suada, conexão lenta, a pessoa toca de novo. O banco recusa pela
     * unicidade, mas o estado local também precisa recusar — senão a tela
     * mostra "série 3 de 4" com duas séries 2 na lista.
     */
    let sessao = reduzir(novo(), { type: 'START', agora: T0 })
    sessao = concluir(sessao, T0 + s(40), 'mesmo-id')
    const depoisDoPrimeiro = sessao
    sessao = concluir(sessao, T0 + s(41), 'mesmo-id')

    expect(sessao.completedSets).toHaveLength(1)
    expect(sessao).toBe(depoisDoPrimeiro)
  })

  it('concluir série fora do estado de série não faz nada', () => {
    let sessao = reduzir(novo(), { type: 'START', agora: T0 })
    sessao = concluir(sessao, T0, 'set-1')
    expect(sessao.state).toBe('RESTING')

    const durante = concluir(sessao, T0 + s(5), 'set-2')
    expect(durante.completedSets).toHaveLength(1)
  })
})

describe('segundo plano, bloqueio e fechamento', () => {
  it('o cronômetro continua correto depois de o app sumir', () => {
    /*
     * O contador que decrementa em JavaScript erra aqui: o navegador estrangula
     * o timer com a tela bloqueada. Como o descanso é um par de instantes, a
     * volta é só uma subtração.
     */
    let sessao = reduzir(novo(), { type: 'START', agora: T0 })
    sessao = concluir(sessao, T0, 'set-1')

    expect(restanteDoDescanso(sessao, T0 + s(30))).toBe(60)
    expect(restanteDoDescanso(sessao, T0 + s(85))).toBe(5)
  })

  it('voltar depois do fim do descanso mostra concluído, sem reiniciar', () => {
    let sessao = reduzir(novo(), { type: 'START', agora: T0 })
    sessao = concluir(sessao, T0, 'set-1')

    // Dez minutos fora: o descanso venceu sozinho.
    const devolta = reidratar(sessao, T0 + s(600))
    expect(devolta.state).toBe('REST_FINISHED')
    expect(restanteDoDescanso(devolta, T0 + s(600))).toBe(0)
  })

  it('reidratar durante o descanso não muda nada', () => {
    let sessao = reduzir(novo(), { type: 'START', agora: T0 })
    sessao = concluir(sessao, T0, 'set-1')
    expect(reidratar(sessao, T0 + s(30))).toBe(sessao)
  })
})

describe('pausa', () => {
  it('o tempo parado sai da duração e empurra o descanso', () => {
    let sessao = reduzir(novo(), { type: 'START', agora: T0 })
    sessao = concluir(sessao, T0 + s(40), 'set-1')
    const fimAntes = sessao.restEndsAt!

    sessao = reduzir(sessao, { type: 'PAUSE', agora: T0 + s(50) })
    sessao = reduzir(sessao, { type: 'RESUME', agora: T0 + s(170) })

    expect(sessao.state).toBe('ACTIVE_SET')
    expect(sessao.pausedMs).toBe(s(120))
    // Quem pausou dois minutos não volta para um descanso já vencido.
    expect(sessao.restEndsAt).toBe(fimAntes + s(120))
    expect(duracaoEfetiva(sessao, T0 + s(200))).toBe(80)
  })
})

describe('progresso e resumo', () => {
  it('o progresso conta séries, não exercícios', () => {
    // 4 + 3 = 7 séries previstas. Uma feita é 1/7, não 1/2 de exercício.
    let sessao = reduzir(novo(), { type: 'START', agora: T0 })
    expect(progresso(sessao)).toBe(0)

    sessao = concluir(sessao, T0, 'set-1')
    expect(progresso(sessao)).toBeCloseTo(1 / 7, 5)
  })

  it('o resumo soma volume, séries, reps e descanso médio', () => {
    let sessao = reduzir(novo([supino]), { type: 'START', agora: T0 })
    let agora = T0
    for (let serie = 1; serie <= 4; serie += 1) {
      agora += s(30)
      sessao = concluir(sessao, agora, `set-${serie}`)
      if (serie < 4) {
        agora += s(90)
        sessao = reduzir(sessao, { type: 'REST_ELAPSED', agora })
        sessao = reduzir(sessao, { type: 'NEXT_SET', agora })
      }
    }

    const r = resumo(sessao, agora)
    expect(r.series).toBe(4)
    expect(r.repeticoes).toBe(40)
    expect(r.volumeKg).toBe(4 * 10 * 70)
    expect(r.exercicios).toBe(1)
    expect(r.descansoMedioSegundos).toBe(90)
    expect(r.duracaoSegundos).toBe(4 * 30 + 3 * 90)
  })
})

describe('troca de exercício', () => {
  it('avança e traz a carga sugerida do exercício novo, não a do anterior', () => {
    let sessao = reduzir(novo(), { type: 'START', agora: T0 })
    let agora = T0
    for (let serie = 1; serie <= 4; serie += 1) {
      agora += s(30)
      sessao = concluir(sessao, agora, `a-${serie}`)
      if (serie < 4) {
        agora += s(90)
        sessao = reduzir(sessao, { type: 'REST_ELAPSED', agora })
        sessao = reduzir(sessao, { type: 'NEXT_SET', agora })
      }
    }
    expect(sessao.state).toBe('EXERCISE_COMPLETED')

    sessao = reduzir(sessao, { type: 'NEXT_EXERCISE', agora })
    expect(sessao.state).toBe('ACTIVE_SET')
    expect(sessao.exerciseIndex).toBe(1)
    expect(sessao.setNumber).toBe(1)
    // Herdar 70 kg do supino para o inclinado é o erro que a pessoa aceita
    // sem olhar e só percebe com a barra na mão.
    expect(sessao.currentWeight).toBe(50)
    expect(sessao.currentReps).toBe(12)
    expect(ehUltimaSerie(sessao)).toBe(false)
  })
})
