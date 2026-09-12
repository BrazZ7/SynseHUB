import { describe, expect, it } from 'vitest'

import { ActivityTrackingEngine } from '@/features/synse-run/engine/tracking-engine'

import { GpsSimulator } from './simulator'

/** Leva o motor até RUNNING, que é onde ele aceita ponto. */
function motorRodando(sport: 'RUN' | 'WALK' | 'RIDE' = 'RUN', inicio = 1_700_000_000_000) {
  const engine = new ActivityTrackingEngine(sport, { weightKg: 75 })
  engine.transition('procurarGps', inicio)
  engine.transition('sinalPronto', inicio)
  engine.transition('contagem', inicio)
  engine.transition('iniciar', inicio)
  return engine
}

describe('corrida normal', () => {
  it('mede distância, pace e velocidade dentro do esperado', () => {
    const gps = new GpsSimulator()
    const engine = motorRodando('RUN', gps.agora)

    // 3 m/s por 600 s = 1.800 m, pace de 05:33/km.
    for (const ponto of gps.correr(3, 600)) engine.addPoint(ponto)

    const retrato = engine.snapshot(gps.agora)

    expect(retrato.distance).toBeGreaterThan(1780)
    expect(retrato.distance).toBeLessThan(1820)
    expect(retrato.averageSpeed).toBeCloseTo(3, 1)
    // 3 m/s são 5:33/km. A folga cobre o degrau da suavização de posição.
    expect(retrato.averagePace).toBeGreaterThan(325)
    expect(retrato.averagePace).toBeLessThan(345)
    expect(retrato.splits).toHaveLength(1)
    expect(retrato.splits[0].seconds).toBeGreaterThan(325)
    expect(retrato.splits[0].seconds).toBeLessThan(345)
  })

  it('estima caloria proporcional ao esforço, e não ao relógio', () => {
    const gps = new GpsSimulator()
    const engine = motorRodando('RUN', gps.agora)
    for (const ponto of gps.correr(3, 600)) engine.addPoint(ponto)

    const correndo = engine.snapshot(gps.agora).calories

    const gps2 = new GpsSimulator()
    const engine2 = motorRodando('WALK', gps2.agora)
    for (const ponto of gps2.correr(1.4, 600)) engine2.addPoint(ponto)

    expect(correndo).toBeGreaterThan(engine2.snapshot(gps2.agora).calories * 2)
  })
})

describe('pessoa parada', () => {
  /*
   * O caso que separa um app de corrida de um somador de ruído: parado no
   * semáforo, o GPS oscila metros a cada segundo. Sem filtro, dois minutos de
   * semáforo viram centenas de metros de corrida.
   */
  it('oscilação de GPS parado não vira distância', () => {
    const gps = new GpsSimulator()
    const engine = motorRodando('RUN', gps.agora)

    for (const ponto of gps.parar(120, 4)) engine.addPoint(ponto)

    expect(engine.snapshot(gps.agora).distance).toBe(0)
  })

  it('pausa sozinho depois de alguns segundos parado, e retoma ao voltar', () => {
    const gps = new GpsSimulator()
    const engine = motorRodando('RUN', gps.agora)

    for (const ponto of gps.correr(3, 60)) engine.addPoint(ponto)
    expect(engine.state).toBe('RUNNING')

    for (const ponto of gps.parar(30)) engine.addPoint(ponto)
    expect(engine.state).toBe('AUTO_PAUSED')

    for (const ponto of gps.correr(3, 30)) engine.addPoint(ponto)
    expect(engine.state).toBe('RUNNING')
  })

  it('tempo parado não conta como tempo em movimento', () => {
    const gps = new GpsSimulator()
    const engine = motorRodando('RUN', gps.agora)

    for (const ponto of gps.correr(3, 60)) engine.addPoint(ponto)
    for (const ponto of gps.parar(60)) engine.addPoint(ponto)
    for (const ponto of gps.correr(3, 60)) engine.addPoint(ponto)

    const retrato = engine.snapshot(gps.agora)

    expect(retrato.elapsedSeconds).toBeCloseTo(180, 0)
    // Os 60 s parados saem do tempo em movimento — menos a folga de alguns
    // segundos que a pausa automática leva para reconhecer que parou.
    expect(retrato.movingSeconds).toBeLessThan(135)
    expect(retrato.movingSeconds).toBeGreaterThan(110)
  })
})

describe('GPS ruim', () => {
  it('descarta ponto com precisão pior que o limite', () => {
    const gps = new GpsSimulator().comPrecisao(80)
    const engine = motorRodando('RUN', gps.agora)

    for (const ponto of gps.correr(3, 60)) engine.addPoint(ponto)

    expect(engine.snapshot(gps.agora).distance).toBe(0)
    expect(engine.snapshot(gps.agora).gpsQuality).toBe('FRACO')
  })

  it('salto de 300 metros em um segundo é recusado', () => {
    const gps = new GpsSimulator()
    const engine = motorRodando('RUN', gps.agora)

    for (const ponto of gps.correr(3, 60)) engine.addPoint(ponto)
    const antes = engine.snapshot(gps.agora).distance

    const resultado = engine.addPoint(gps.saltar(300))

    expect(resultado.accepted).toBe(false)
    expect(engine.snapshot(gps.agora).distance).toBe(antes)
  })

  it('perder o sinal e voltar não inventa distância no intervalo', () => {
    const gps = new GpsSimulator()
    const engine = motorRodando('RUN', gps.agora)

    for (const ponto of gps.correr(3, 60)) engine.addPoint(ponto)
    const antes = engine.snapshot(gps.agora).distance

    // Um minuto sem sinal, e o ponto seguinte reaparece 180 m à frente: é
    // deslocamento plausível para o tempo passado, então entra.
    gps.perderSinal(60)
    engine.addPoint(gps.saltar(180))

    /*
     * Os 180 metros entram inteiros, mais o atraso da posição suavizada: antes
     * do buraco, a média estava alguns metros atrás da posição real, e esse
     * resto é cobrado agora. É o comportamento certo — a distância existe, só
     * chegou junta.
     */
    const depois = engine.snapshot(gps.agora).distance
    expect(depois - antes).toBeGreaterThan(175)
    expect(depois - antes).toBeLessThan(200)
  })

  it('a precisão volta a ser aceita quando o sinal melhora', () => {
    const gps = new GpsSimulator().comPrecisao(80)
    const engine = motorRodando('RUN', gps.agora)

    for (const ponto of gps.correr(3, 30)) engine.addPoint(ponto)
    expect(engine.snapshot(gps.agora).distance).toBe(0)

    gps.comPrecisao(5)
    for (const ponto of gps.correr(3, 60)) engine.addPoint(ponto)

    expect(engine.snapshot(gps.agora).distance).toBeGreaterThan(150)
    expect(engine.snapshot(gps.agora).gpsQuality).toBe('EXCELENTE')
  })
})

describe('elevação', () => {
  it('oscilação pequena de altitude não vira ganho', () => {
    const gps = new GpsSimulator()
    const engine = motorRodando('RUN', gps.agora)

    for (let i = 0; i < 30; i += 1) {
      gps.variarAltitude(i % 2 === 0 ? 2 : -2)
      for (const ponto of gps.correr(3, 2)) engine.addPoint(ponto)
    }

    expect(engine.snapshot(gps.agora).elevationGain).toBe(0)
  })

  it('subida de verdade é contabilizada', () => {
    const gps = new GpsSimulator()
    const engine = motorRodando('RUN', gps.agora)

    for (let i = 0; i < 20; i += 1) {
      gps.variarAltitude(5)
      for (const ponto of gps.correr(3, 2)) engine.addPoint(ponto)
    }

    const retrato = engine.snapshot(gps.agora)
    expect(retrato.elevationGain).toBeGreaterThan(80)
    expect(retrato.elevationLoss).toBe(0)
  })
})

describe('parciais por quilômetro', () => {
  it('fecha uma parcial por quilômetro, com o tempo interpolado', () => {
    const gps = new GpsSimulator()
    const engine = motorRodando('RUN', gps.agora)

    // 3.030 m a 3 m/s: três parciais de ~333 s.
    for (const ponto of gps.correr(3, 1010)) engine.addPoint(ponto)

    const parciais = engine.snapshot(gps.agora).splits
    expect(parciais.map((p) => p.kilometer)).toEqual([1, 2, 3])
    for (const parcial of parciais) {
      expect(parcial.seconds).toBeGreaterThan(325)
      expect(parcial.seconds).toBeLessThan(345)
    }

    // A soma das parciais não pode ultrapassar o tempo total da atividade.
    const soma = parciais.reduce((total, p) => total + p.seconds, 0)
    expect(soma).toBeLessThanOrEqual(engine.snapshot(gps.agora).elapsedSeconds + 1)
  })

  it('avisa cada quilômetro uma vez só', () => {
    const gps = new GpsSimulator()
    const engine = motorRodando('RUN', gps.agora)

    for (const ponto of gps.correr(3, 1010)) engine.addPoint(ponto)

    const marcos = engine.drainEvents().filter((evento) => evento.type === 'MARCO_KM')
    expect(marcos).toHaveLength(3)
    expect(engine.drainEvents().filter((e) => e.type === 'MARCO_KM')).toHaveLength(0)
  })
})

describe('máquina de estados', () => {
  it('não deixa iniciar sem passar pela contagem', () => {
    const engine = new ActivityTrackingEngine('RUN')
    expect(engine.transition('iniciar')).toBe(false)
    expect(engine.state).toBe('IDLE')
  })

  it('não deixa retomar uma atividade encerrada', () => {
    const engine = motorRodando()
    engine.transition('finalizar')
    engine.transition('concluir')

    expect(engine.transition('retomar')).toBe(false)
    expect(engine.state).toBe('FINISHED')
  })

  it('pausa manual congela o tempo em movimento', () => {
    const gps = new GpsSimulator()
    const engine = motorRodando('RUN', gps.agora)

    for (const ponto of gps.correr(3, 60)) engine.addPoint(ponto)
    engine.transition('pausar', gps.agora)

    const paradoEm = engine.snapshot(gps.agora).movingSeconds
    gps.perderSinal(120)

    expect(engine.snapshot(gps.agora).movingSeconds).toBeCloseTo(paradoEm, 0)
    expect(engine.snapshot(gps.agora).elapsedSeconds).toBeCloseTo(180, 0)
  })

  it('ponto que chega durante a pausa não vira distância', () => {
    const gps = new GpsSimulator()
    const engine = motorRodando('RUN', gps.agora)

    for (const ponto of gps.correr(3, 60)) engine.addPoint(ponto)
    const antes = engine.snapshot(gps.agora).distance

    engine.transition('pausar', gps.agora)
    for (const ponto of gps.correr(3, 60)) engine.addPoint(ponto)

    expect(engine.snapshot(gps.agora).distance).toBe(antes)
  })
})

describe('recuperação', () => {
  it('retoma de onde parou, sem perder distância nem parciais', () => {
    const gps = new GpsSimulator()
    const engine = motorRodando('RUN', gps.agora)
    for (const ponto of gps.correr(3, 700)) engine.addPoint(ponto)

    const antes = engine.snapshot(gps.agora)

    const recuperado = ActivityTrackingEngine.restore({
      sport: 'RUN',
      points: [...engine.trackPoints],
      startedAt: engine.startedAt as number,
      pausedMs: 0,
      state: 'PAUSED',
    })

    const depois = recuperado.snapshot(gps.agora)
    expect(depois.distance).toBeCloseTo(antes.distance, 5)
    expect(depois.splits).toHaveLength(antes.splits.length)

    // E não repete os avisos de quilômetro já dados antes da queda.
    recuperado.transition('retomar', gps.agora)
    for (const ponto of gps.correr(3, 60)) recuperado.addPoint(ponto)
    expect(recuperado.drainEvents().filter((e) => e.type === 'MARCO_KM')).toHaveLength(0)
  })
})

describe('parado em casa, sinal ruim', () => {
  /*
   * O caso que chegou de campo: pessoa parada dentro de casa, precisão em
   * torno de 20 metros, e o app contabilizando distância.
   *
   * A oscilação de 12 metros passava o limiar de ruído (40% da precisão = 8 m)
   * e, pior, cada ponto aceito durante a pausa automática RETOMAVA a corrida e
   * somava a distância. Parado, o app alternava pausa e retomada somando ruído.
   */
  it('oscilação com precisão ruim não vira distância', () => {
    const gps = new GpsSimulator().comPrecisao(20)
    const engine = motorRodando('RUN', gps.agora)

    for (const ponto of gps.parar(180, 12)) engine.addPoint(ponto)

    expect(engine.snapshot(gps.agora).distance).toBe(0)
  })

  it('depois de pausar sozinho, ruído não retoma nem soma', () => {
    const gps = new GpsSimulator().comPrecisao(20)
    const engine = motorRodando('RUN', gps.agora)

    for (const ponto of gps.correr(3, 60)) engine.addPoint(ponto)

    /*
     * Os primeiros segundos parado ainda somam, e devem somar: com precisão de
     * 20 metros a distância entra em degraus de 20, e o último degrau da
     * corrida só fecha quando a pessoa para. Isso é distância que ela correu,
     * chegando junta — o teste mede o que vem *depois* disso.
     */
    for (const ponto of gps.parar(20, 12)) engine.addPoint(ponto)
    expect(engine.state).toBe('AUTO_PAUSED')

    const aoPausar = engine.snapshot(gps.agora).distance

    // Dois minutos parado em casa, com o GPS oscilando doze metros.
    for (const ponto of gps.parar(120, 12)) engine.addPoint(ponto)

    expect(engine.state).toBe('AUTO_PAUSED')
    expect(engine.snapshot(gps.agora).distance).toBe(aoPausar)
  })

  it('movimento de verdade depois da pausa retoma e conta', () => {
    const gps = new GpsSimulator().comPrecisao(20)
    const engine = motorRodando('RUN', gps.agora)

    for (const ponto of gps.correr(3, 60)) engine.addPoint(ponto)
    for (const ponto of gps.parar(60, 12)) engine.addPoint(ponto)
    expect(engine.state).toBe('AUTO_PAUSED')

    const antes = engine.snapshot(gps.agora).distance
    for (const ponto of gps.correr(3, 120)) engine.addPoint(ponto)

    expect(engine.state).toBe('RUNNING')
    // 120 s a 3 m/s são 360 m. A folga cobre o atraso da retomada.
    expect(engine.snapshot(gps.agora).distance - antes).toBeGreaterThan(300)
  })
})
