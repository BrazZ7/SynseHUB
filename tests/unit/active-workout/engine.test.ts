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

describe('desfazer a série', () => {
  /*
   * O toque em "concluir série" é grande, fica no meio da tela e é apertado
   * com a mão cansada entre duas séries. Até existir o desfazer, ele era
   * definitivo — e quem errava a última série do último exercício encerrava o
   * treino sem querer.
   *
   * É o aceite 9 do pedido: "desfazer restaura o estado e corrige efeitos
   * derivados".
   */
  const desfazer = (sessao: WorkoutSession, agora: number) =>
    reduzir(sessao, { type: 'UNDO_SET', agora })

  it('tira a série da lista e volta a executá-la', () => {
    let sessao = novo()
    sessao = reduzir(sessao, { type: 'START', agora: T0 })
    sessao = concluir(sessao, T0 + s(40))
    expect(sessao.state).toBe('RESTING')

    sessao = desfazer(sessao, T0 + s(45))

    expect(sessao.completedSets).toHaveLength(0)
    expect(sessao.state).toBe('ACTIVE_SET')
    expect(sessao.setNumber).toBe(1)
  })

  it('cancela o descanso que a conclusão tinha aberto', () => {
    // Era descanso de uma série que não aconteceu. Deixá-lo correndo mostraria
    // um cronômetro contando para a série que a pessoa está fazendo agora.
    let sessao = novo()
    sessao = reduzir(sessao, { type: 'START', agora: T0 })
    sessao = concluir(sessao, T0 + s(40))

    sessao = desfazer(sessao, T0 + s(45))

    expect(sessao.restEndsAt).toBeNull()
    expect(sessao.restStartedAt).toBeNull()
    expect(restanteDoDescanso(sessao, T0 + s(45))).toBe(0)
  })

  it('devolve as reps e a carga que a série tinha', () => {
    /*
     * Quem desfaz quase sempre quer corrigir o número, não recomeçar do
     * sugerido: concluiu com 10 e eram 8. Voltar para a carga da ficha
     * obrigaria a redigitar o que estava certo.
     */
    let sessao = novo()
    sessao = reduzir(sessao, { type: 'START', agora: T0 })
    sessao = reduzir(sessao, { type: 'ADJUST_REPS', delta: -2 })
    sessao = reduzir(sessao, { type: 'ADJUST_WEIGHT', delta: 5 })
    sessao = concluir(sessao, T0 + s(40))

    sessao = desfazer(sessao, T0 + s(45))

    expect(sessao.currentReps).toBe(8)
    expect(sessao.currentWeight).toBe(75)
  })

  it('devolve o número da série desfeita, não o que está na tela', () => {
    /*
     * A mutação que exigiu este teste: `ultima.repsCompleted` trocado por
     * `s.currentReps` passava em tudo, porque concluir a série não mexe no
     * contador — os dois valores são iguais logo depois do toque.
     *
     * Eles divergem no caso que importa. A pessoa conclui a série 1 com 8
     * reps, começa a série 2, ajusta para 12, e **então** percebe que a
     * primeira foi registrada errada. Desfazer precisa trazer de volta os 8 da
     * série desfeita; trazer os 12 gravaria na correção um número que nunca
     * aconteceu.
     */
    let sessao = novo()
    sessao = reduzir(sessao, { type: 'START', agora: T0 })
    sessao = reduzir(sessao, { type: 'ADJUST_REPS', delta: -2 })
    sessao = concluir(sessao, T0 + s(40))
    sessao = reduzir(sessao, { type: 'SKIP_REST', agora: T0 + s(45) })
    sessao = reduzir(sessao, { type: 'NEXT_SET', agora: T0 + s(46) })

    sessao = reduzir(sessao, { type: 'ADJUST_REPS', delta: 4 })
    sessao = reduzir(sessao, { type: 'ADJUST_WEIGHT', delta: 10 })
    expect(sessao.currentReps).toBe(12)

    sessao = desfazer(sessao, T0 + s(60))

    expect(sessao.currentReps).toBe(8)
    expect(sessao.currentWeight).toBe(70)
    expect(sessao.setNumber).toBe(1)
  })

  it('preserva o instante em que a série começou', () => {
    // A duração da série é dado. Carimbar `setStartedAt` de novo a encurtaria
    // para quem desfez, e o número iria para o banco.
    let sessao = novo()
    sessao = reduzir(sessao, { type: 'START', agora: T0 })
    const comecou = sessao.setStartedAt
    sessao = concluir(sessao, T0 + s(40))

    sessao = desfazer(sessao, T0 + s(45))

    expect(sessao.setStartedAt).toBe(comecou)
  })

  it('volta para a série certa, não para a primeira', () => {
    let sessao = novo()
    sessao = reduzir(sessao, { type: 'START', agora: T0 })
    let agora = T0
    for (const serie of [1, 2, 3]) {
      agora += s(40)
      sessao = concluir(sessao, agora, `d-${serie}`)
      agora += s(90)
      sessao = reduzir(sessao, { type: 'REST_ELAPSED', agora })
      sessao = reduzir(sessao, { type: 'NEXT_SET', agora })
    }
    agora += s(40)
    sessao = concluir(sessao, agora, 'd-4')
    expect(sessao.state).toBe('EXERCISE_COMPLETED')

    sessao = desfazer(sessao, agora + s(5))

    expect(sessao.setNumber).toBe(4)
    expect(sessao.completedSets).toHaveLength(3)
    expect(sessao.state).toBe('ACTIVE_SET')
  })

  it('reabre o treino encerrado pelo toque na última série', () => {
    /*
     * O caso mais caro de todos. A última série do último exercício leva
     * direto a WORKOUT_COMPLETED: o toque errado ali encerrava o treino, e sem
     * o desfazer a pessoa ficava olhando um resumo que não era o treino dela.
     */
    let sessao = novo([{ ...supino, sets: 1 }])
    sessao = reduzir(sessao, { type: 'START', agora: T0 })
    sessao = concluir(sessao, T0 + s(40))
    expect(sessao.state).toBe('WORKOUT_COMPLETED')
    expect(sessao.finishedAt).not.toBeNull()

    sessao = desfazer(sessao, T0 + s(45))

    expect(sessao.state).toBe('ACTIVE_SET')
    expect(sessao.finishedAt).toBeNull()
  })

  it('volta ao exercício da série desfeita, não ao que está na tela', () => {
    // Desfazer logo depois de trocar de exercício: a série desfeita é a última
    // do exercício anterior, e é para lá que o treino volta.
    let sessao = novo()
    sessao = reduzir(sessao, { type: 'START', agora: T0 })
    let agora = T0
    for (const serie of [1, 2, 3, 4]) {
      agora += s(40)
      sessao = concluir(sessao, agora, `t-${serie}`)
      if (serie < 4) {
        agora += s(90)
        sessao = reduzir(sessao, { type: 'REST_ELAPSED', agora })
        sessao = reduzir(sessao, { type: 'NEXT_SET', agora })
      }
    }
    sessao = reduzir(sessao, { type: 'NEXT_EXERCISE', agora })
    expect(sessao.exerciseIndex).toBe(1)

    sessao = desfazer(sessao, agora + s(5))

    expect(sessao.exerciseIndex).toBe(0)
    expect(sessao.setNumber).toBe(4)
  })

  it('o progresso volta junto', () => {
    // O efeito derivado que mora no cliente. Os outros — desafio, medalha —
    // são do banco (0058).
    let sessao = novo()
    sessao = reduzir(sessao, { type: 'START', agora: T0 })
    sessao = concluir(sessao, T0 + s(40))
    const comUma = progresso(sessao)

    sessao = desfazer(sessao, T0 + s(45))

    expect(progresso(sessao)).toBe(0)
    expect(comUma).toBeGreaterThan(0)
  })

  it('o resumo volta junto', () => {
    let sessao = novo()
    sessao = reduzir(sessao, { type: 'START', agora: T0 })
    sessao = concluir(sessao, T0 + s(40))

    sessao = desfazer(sessao, T0 + s(45))

    const r = resumo(sessao, T0 + s(45))
    expect(r.series).toBe(0)
    expect(r.volumeKg).toBe(0)
    expect(r.repeticoes).toBe(0)
  })

  it('sem série concluída, não faz nada', () => {
    let sessao = novo()
    sessao = reduzir(sessao, { type: 'START', agora: T0 })

    expect(desfazer(sessao, T0 + s(5))).toBe(sessao)
  })

  it('durante a pausa, não faz nada', () => {
    /*
     * Desfazer põe o treino em ACTIVE_SET; de dentro da pausa isso retomaria o
     * treino de lado, sem fechar a conta do tempo parado — e a duração sairia
     * errada. Quem está pausado retoma primeiro.
     */
    let sessao = novo()
    sessao = reduzir(sessao, { type: 'START', agora: T0 })
    sessao = concluir(sessao, T0 + s(40))
    sessao = reduzir(sessao, { type: 'PAUSE', agora: T0 + s(45) })

    expect(desfazer(sessao, T0 + s(50))).toBe(sessao)
  })

  it('desfazer duas vezes tira duas séries', () => {
    // Não há limite de uma: o que não se desfaz é série que não é a última.
    let sessao = novo()
    sessao = reduzir(sessao, { type: 'START', agora: T0 })
    sessao = concluir(sessao, T0 + s(40), 'n-1')
    sessao = reduzir(sessao, { type: 'SKIP_REST', agora: T0 + s(45) })
    sessao = reduzir(sessao, { type: 'NEXT_SET', agora: T0 + s(46) })
    sessao = concluir(sessao, T0 + s(90), 'n-2')

    sessao = desfazer(sessao, T0 + s(95))
    sessao = desfazer(sessao, T0 + s(96))

    expect(sessao.completedSets).toHaveLength(0)
    expect(sessao.setNumber).toBe(1)
  })

  it('a série concluída de novo entra com outro identificador', () => {
    /*
     * A guarda de idempotência do `COMPLETE_SET` compara `clientId`. Se o
     * desfazer deixasse a série na lista, a correção seria ignorada em
     * silêncio — e a pessoa veria o botão não responder.
     */
    let sessao = novo()
    sessao = reduzir(sessao, { type: 'START', agora: T0 })
    sessao = concluir(sessao, T0 + s(40), 'c-1')
    sessao = desfazer(sessao, T0 + s(45))

    sessao = concluir(sessao, T0 + s(50), 'c-2')

    expect(sessao.completedSets).toHaveLength(1)
    expect(sessao.completedSets[0].clientId).toBe('c-2')
    expect(sessao.completedSets[0].setNumber).toBe(1)
  })
})

describe('o fim do treino', () => {
  /*
   * ── O treino que nunca dizia ao servidor que terminou ─────────────────────
   *
   * Estes testes existem por causa de um defeito encontrado ao ligar o
   * desfazer. O botão "Concluir treino" — o único lugar da tela que chamava
   * `encerrar('COMPLETED')` — vivia dentro do painel de fim de exercício, no
   * ramo "não há próximo exercício". E esse ramo é inalcançável.
   *
   * O motivo está logo abaixo: a última série do último exercício vai direto
   * para WORKOUT_COMPLETED, sem passar por EXERCISE_COMPLETED. Então
   * EXERCISE_COMPLETED só existe quando **há** próximo exercício, o botão
   * nunca aparecia, `finish_workout_session` nunca era chamada, e
   * `listWorkoutSessions` — que filtra `status = 'COMPLETED'` — não achava
   * treino nenhum. A pessoa treinava e o histórico ficava vazio.
   */
  it('a última série do último exercício encerra o treino direto', () => {
    let sessao = novo([{ ...supino, sets: 1 }])
    sessao = reduzir(sessao, { type: 'START', agora: T0 })
    sessao = concluir(sessao, T0 + s(40))

    expect(sessao.state).toBe('WORKOUT_COMPLETED')
    expect(sessao.finishedAt).toBe(T0 + s(40))
  })

  it('EXERCISE_COMPLETED só acontece quando existe próximo exercício', () => {
    /*
     * A invariante que tornava o botão inalcançável. Ela continua valendo — o
     * que mudou é que o encerramento no servidor não depende mais dela.
     */
    let sessao = novo([
      { ...supino, sets: 1 },
      { ...inclinado, sets: 1 },
    ])
    sessao = reduzir(sessao, { type: 'START', agora: T0 })

    sessao = concluir(sessao, T0 + s(40), 'p-1')
    expect(sessao.state).toBe('EXERCISE_COMPLETED')
    // Há próximo: é a única forma de estar neste estado.
    expect(sessao.exercises[sessao.exerciseIndex + 1]).toBeDefined()

    sessao = reduzir(sessao, { type: 'NEXT_EXERCISE', agora: T0 + s(45) })
    sessao = concluir(sessao, T0 + s(90), 'p-2')
    expect(sessao.state).toBe('WORKOUT_COMPLETED')
  })
})
