import { describe, expect, it } from 'vitest'

import {
  aderencia,
  cargaMaximaEstimada,
  compararTotais,
  constancia,
  evolucaoDaForca,
  recordesNoPeriodo,
  REPS_MAXIMAS_CONFIAVEIS,
  SESSOES_RECENTES,
  variacao,
} from '@/features/analysis/metrics'
import type {
  ExercisePersonalRecord,
  ExerciseProgressPoint,
  WorkoutAdherenceRow,
  WorkoutTotals,
} from '@/types/domain'

function ponto(week: string, maxWeight: number | null): ExerciseProgressPoint {
  return { week, maxWeight, volumeKg: 0, sets: 0, reps: 0 }
}

function totais(parcial: Partial<WorkoutTotals>): WorkoutTotals {
  return {
    workouts: 0,
    sets: 0,
    reps: 0,
    volumeKg: 0,
    averageDurationSeconds: null,
    averageRestSeconds: null,
    distinctExercises: 0,
    ...parcial,
  }
}

describe('cargaMaximaEstimada', () => {
  it('aplica Epley e arredonda para o meio quilo da academia', () => {
    // 80 × (1 + 5/30) = 93,33 → 93,5
    expect(cargaMaximaEstimada(80, 5)).toBe(93.5)
    // 70 × (1 + 10/30) = 93,33 → 93,5. É o ponto do método: as duas séries
    // se comparam, e nenhuma das duas cargas brutas diria isso.
    expect(cargaMaximaEstimada(70, 10)).toBe(93.5)
  })

  it('devolve a própria carga na série de uma repetição', () => {
    // Epley com reps=1 dá 1,033× — mas aqui não há o que estimar.
    expect(cargaMaximaEstimada(100, 1)).toBe(103.5)
  })

  it('recusa série longa demais para a fórmula valer', () => {
    expect(cargaMaximaEstimada(40, REPS_MAXIMAS_CONFIAVEIS)).not.toBeNull()
    expect(cargaMaximaEstimada(40, REPS_MAXIMAS_CONFIAVEIS + 1)).toBeNull()
    expect(cargaMaximaEstimada(40, 25)).toBeNull()
  })

  it('não estima sobre entrada inválida', () => {
    expect(cargaMaximaEstimada(0, 5)).toBeNull()
    expect(cargaMaximaEstimada(-80, 5)).toBeNull()
    expect(cargaMaximaEstimada(80, 0)).toBeNull()
    expect(cargaMaximaEstimada(Number.NaN, 5)).toBeNull()
    expect(cargaMaximaEstimada(80, Number.POSITIVE_INFINITY)).toBeNull()
  })
})

describe('variacao', () => {
  it('devolve delta e percentual com uma casa', () => {
    expect(variacao(72, 81)).toEqual({ antes: 72, depois: 81, delta: 9, percentual: 12.5 })
  })

  it('não transforma saída do zero em Infinity nem em 100%', () => {
    // O defeito que isto existe para impedir: "Infinity%" impresso no cartão.
    expect(variacao(0, 40).percentual).toBeNull()
    expect(variacao(0, 40).delta).toBe(40)
  })

  it('marca a queda com sinal negativo', () => {
    expect(variacao(100, 75)).toMatchObject({ delta: -25, percentual: -25 })
  })

  it('usa o módulo do anterior, para número negativo não inverter o sinal', () => {
    expect(variacao(-10, -5).percentual).toBe(50)
  })

  it('não propaga entrada inválida', () => {
    expect(variacao(Number.NaN, 10).percentual).toBeNull()
  })
})

describe('evolucaoDaForca', () => {
  it('compara a primeira e a última semana com carga', () => {
    const resultado = evolucaoDaForca([
      ponto('2026-06-01', 72),
      ponto('2026-06-29', 78),
      ponto('2026-08-24', 81),
    ])

    expect(resultado).toMatchObject({ de: 72, para: 81, delta: 9, percentual: 12.5 })
    expect(resultado?.semanas).toBe(12)
  })

  it('ignora semana sem carga em vez de derrubar a curva', () => {
    // Semana de peso do corpo no meio: não é queda de força.
    const resultado = evolucaoDaForca([
      ponto('2026-06-01', 72),
      ponto('2026-06-08', null),
      ponto('2026-06-15', 80),
    ])

    expect(resultado).toMatchObject({ de: 72, para: 80 })
  })

  it('ordena por semana, sem confiar na ordem da consulta', () => {
    const resultado = evolucaoDaForca([ponto('2026-08-24', 81), ponto('2026-06-01', 72)])
    expect(resultado).toMatchObject({ de: 72, para: 81 })
  })

  it('não chama de evolução o que é uma foto só', () => {
    expect(evolucaoDaForca([])).toBeNull()
    expect(evolucaoDaForca([ponto('2026-06-01', 72)])).toBeNull()
    expect(evolucaoDaForca([ponto('2026-06-01', null), ponto('2026-06-08', 80)])).toBeNull()
  })
})

describe('compararTotais', () => {
  it('põe os dois períodos lado a lado sem dar veredito', () => {
    const resultado = compararTotais(
      totais({ workouts: 10, sets: 120, reps: 1_200, volumeKg: 48_000, distinctExercises: 14 }),
      totais({ workouts: 13, sets: 150, reps: 1_380, volumeKg: 61_000, distinctExercises: 12 }),
    )

    expect(resultado.treinos).toMatchObject({ delta: 3, percentual: 30 })
    expect(resultado.volumeKg.percentual).toBeCloseTo(27.1, 1)
    // Menos exercícios distintos aparece como queda, e não como "foco".
    // Interpretar é da tela, que sabe o objetivo da pessoa.
    expect(resultado.exerciciosDistintos.delta).toBe(-2)
  })

  it('omite a duração quando algum dos lados não a registrou', () => {
    const semDuracao = compararTotais(
      totais({ averageDurationSeconds: null }),
      totais({ averageDurationSeconds: 3_600 }),
    )
    expect(semDuracao.duracaoMediaSegundos).toBeNull()

    const comDuracao = compararTotais(
      totais({ averageDurationSeconds: 3_000 }),
      totais({ averageDurationSeconds: 3_600 }),
    )
    expect(comDuracao.duracaoMediaSegundos).toMatchObject({ delta: 600, percentual: 20 })
  })
})

describe('constancia', () => {
  const janela = { de: new Date('2026-08-01T00:00:00Z'), ate: new Date('2026-08-29T00:00:00Z') }

  it('conta treinos e média semanal na janela', () => {
    const resultado = constancia(
      [
        '2026-08-03T10:00:00Z',
        '2026-08-05T10:00:00Z',
        '2026-08-07T10:00:00Z',
        '2026-08-10T10:00:00Z',
      ],
      janela,
    )

    expect(resultado?.treinos).toBe(4)
    expect(resultado?.dias).toBe(28)
    expect(resultado?.mediaSemanal).toBe(1)
  })

  it('enxerga quem treinou forte e sumiu', () => {
    // Três semanas cheias e a última vazia. É esta pessoa que o relatório
    // precisa mostrar, e é ela que uma média sozinha esconderia.
    const resultado = constancia(
      ['2026-08-03T10:00:00Z', '2026-08-05T10:00:00Z', '2026-08-07T10:00:00Z'],
      janela,
    )

    expect(resultado?.diasSemTreinar).toBe(22)
    expect(resultado?.maiorIntervaloDias).toBe(22)
  })

  it('conta o silêncio do começo da janela como intervalo', () => {
    const resultado = constancia(['2026-08-20T10:00:00Z', '2026-08-28T10:00:00Z'], janela)
    // 1º→20 são 19 dias, maiores que os 8 entre os dois treinos e que o 1 do fim.
    expect(resultado?.maiorIntervaloDias).toBe(19)
  })

  it('descarta data fora da janela', () => {
    const resultado = constancia(
      ['2026-07-15T10:00:00Z', '2026-08-05T10:00:00Z', '2026-09-10T10:00:00Z', 'nao-e-data'],
      janela,
    )
    expect(resultado?.treinos).toBe(1)
  })

  it('devolve janela inteira como intervalo para quem não treinou', () => {
    const resultado = constancia([], janela)
    expect(resultado).toMatchObject({ treinos: 0, mediaSemanal: 0, maiorIntervaloDias: 28 })
    // Nunca treinou não é "zero dias sem treinar".
    expect(resultado?.diasSemTreinar).toBeNull()
  })

  it('recusa janela invertida ou vazia', () => {
    const instante = new Date('2026-08-01T00:00:00Z')
    expect(constancia([], { de: instante, ate: instante })).toBeNull()
    expect(
      constancia([], { de: new Date('2026-08-29T00:00:00Z'), ate: instante }),
    ).toBeNull()
  })
})

describe('recordesNoPeriodo', () => {
  const recorde = (
    exerciseId: string,
    maxWeight: number,
    reps: number,
    achievedAt: string,
  ): ExercisePersonalRecord => ({
    exerciseId,
    exerciseName: exerciseId,
    maxWeight,
    reps,
    achievedAt,
  })

  const janela = { de: new Date('2026-08-01T00:00:00Z'), ate: new Date('2026-08-31T23:59:59Z') }

  it('só traz o recorde que caiu dentro da janela', () => {
    const resultado = recordesNoPeriodo(
      [
        recorde('supino', 100, 5, '2026-08-12T10:00:00Z'),
        recorde('agachamento', 140, 3, '2024-02-01T10:00:00Z'),
      ],
      janela,
    )

    expect(resultado.map((linha) => linha.exerciseId)).toEqual(['supino'])
  })

  it('anexa a carga estimada, e deixa nula na série longa', () => {
    const resultado = recordesNoPeriodo(
      [
        recorde('supino', 100, 5, '2026-08-12T10:00:00Z'),
        recorde('extensora', 60, 20, '2026-08-13T10:00:00Z'),
      ],
      janela,
    )

    const porId = new Map(resultado.map((linha) => [linha.exerciseId, linha]))
    expect(porId.get('supino')?.cargaMaximaEstimada).toBe(116.5)
    expect(porId.get('extensora')?.cargaMaximaEstimada).toBeNull()
  })

  it('devolve do mais recente para trás', () => {
    const resultado = recordesNoPeriodo(
      [
        recorde('a', 50, 5, '2026-08-02T10:00:00Z'),
        recorde('b', 50, 5, '2026-08-20T10:00:00Z'),
        recorde('c', 50, 5, '2026-08-11T10:00:00Z'),
      ],
      janela,
    )

    expect(resultado.map((linha) => linha.exerciseId)).toEqual(['b', 'c', 'a'])
  })
})

describe('aderencia', () => {
  /** Uma sessão com `feitas` de `previstas` repetições. */
  function sessao(dia: string, previstas: number, feitas: number, abaixo = 0): WorkoutAdherenceRow {
    return {
      sessionId: dia,
      startedAt: `2026-09-${dia}T10:00:00Z`,
      plannedSets: 3,
      plannedReps: previstas,
      completedReps: feitas,
      setsBelowPlan: abaixo,
    }
  }

  it('soma o planejado e o feito do período', () => {
    const resultado = aderencia([sessao('01', 30, 30), sessao('03', 30, 21, 2)])

    expect(resultado).toMatchObject({ sessoes: 2, planejadas: 60, feitas: 51, seriesAbaixo: 2 })
    expect(resultado?.fracao).toBeCloseTo(0.85, 3)
  })

  it('não limita a fração em 1 para quem fez além do combinado', () => {
    // O defeito do cartão de medalha: 17 check-ins numa meta de 12 viravam
    // "100%", e o feito sumia.
    expect(aderencia([sessao('01', 30, 36)])?.fracao).toBeCloseTo(1.2, 3)
  })

  it('compara as últimas sessões com o que veio antes delas, não com a média', () => {
    const linhas = [
      sessao('01', 30, 30),
      sessao('03', 30, 30),
      sessao('05', 30, 30),
      sessao('20', 30, 21),
      sessao('22', 30, 21),
      sessao('24', 30, 24),
    ]

    const resultado = aderencia(linhas)

    expect(resultado?.anterior).toBeCloseTo(1, 3)
    expect(resultado?.recente).toBeCloseTo(0.733, 2)
    // A média do período inteiro amorteceria a queda para 0,86 — que é
    // exatamente o número que esconderia a notícia.
    expect(resultado?.fracao).toBeCloseTo(0.867, 2)
  })

  it('não compara sem o dobro do recorte de sessões', () => {
    const quase = Array.from({ length: SESSOES_RECENTES * 2 - 1 }, (_, i) =>
      sessao(String(i + 10), 30, 30),
    )
    expect(aderencia(quase)?.recente).toBeNull()
    expect(aderencia(quase)?.anterior).toBeNull()

    const suficiente = [...quase, sessao('28', 30, 30)]
    expect(aderencia(suficiente)?.recente).not.toBeNull()
  })

  it('ordena por data, sem confiar na ordem da consulta', () => {
    const resultado = aderencia([
      sessao('24', 30, 15),
      sessao('01', 30, 30),
      sessao('22', 30, 15),
      sessao('03', 30, 30),
      sessao('20', 30, 15),
      sessao('05', 30, 30),
    ])

    expect(resultado?.anterior).toBeCloseTo(1, 3)
    expect(resultado?.recente).toBeCloseTo(0.5, 3)
  })

  it('não mede aderência de quem só treinou livre', () => {
    expect(aderencia([])).toBeNull()
    // Linha com zero previsto não deveria vir do SQL, mas se vier não vira
    // divisão por zero.
    expect(aderencia([sessao('01', 0, 12)])).toBeNull()
  })
})
