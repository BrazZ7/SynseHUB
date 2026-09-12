'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { ActivityTrackingEngine } from '@/features/synse-run/engine/tracking-engine'
import type { ActivitySnapshot, RawPoint, SportType } from '@/features/synse-run/engine/types'
import {
  discardLocalActivity,
  findUnfinishedActivity,
  newClientId,
  saveLocalActivity,
  type StoredActivity,
} from '@/features/synse-run/storage/local-activity'

/**
 * A ponte entre o navegador e o motor.
 *
 * O motor é puro e testado; aqui mora tudo que só existe no navegador e não dá
 * para testar sem um: permissão de localização, `watchPosition`, wake lock,
 * aba escondida, IndexedDB. Manter os dois separados é o que permitiu achar
 * três defeitos de cálculo antes de existir tela.
 *
 * ATENÇÃO, e isto é limite de plataforma, não de esforço: **num navegador, a
 * corrida para quando a tela desliga.** iOS suspende o JavaScript da aba em
 * segundo plano, e nenhuma API de site contorna isso. O que dá para fazer, e é
 * feito aqui, é manter a tela acesa (Wake Lock), gravar cada ponto no aparelho
 * e reconstruir ao voltar. Rastreamento com tela apagada exige aplicativo
 * nativo — está no plano, e não é esta entrega.
 */

export type TrackerStatus = {
  snapshot: ActivitySnapshot
  permission: 'unknown' | 'prompt' | 'granted' | 'denied'
  error: string | null
  /** Corrida encontrada no aparelho, esperando decisão. */
  recovered: StoredActivity | null
  screenLocked: boolean
}

const RETRATO_VAZIO: ActivitySnapshot = {
  state: 'IDLE',
  distance: 0,
  elapsedSeconds: 0,
  movingSeconds: 0,
  currentSpeed: 0,
  averageSpeed: 0,
  maxSpeed: 0,
  currentPace: null,
  averagePace: null,
  bestPace: null,
  altitude: null,
  elevationGain: 0,
  elevationLoss: 0,
  minAltitude: null,
  maxAltitude: null,
  calories: 0,
  splits: [],
  gpsQuality: 'AUSENTE',
  pointCount: 0,
}

export function useActivityTracker(sport: SportType, weightKg?: number) {
  const engineRef = useRef<ActivityTrackingEngine | null>(null)
  const watchRef = useRef<number | null>(null)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const clientIdRef = useRef<string>(newClientId())

  const [snapshot, setSnapshot] = useState<ActivitySnapshot>(RETRATO_VAZIO)
  const [permission, setPermission] = useState<TrackerStatus['permission']>('unknown')
  const [error, setError] = useState<string | null>(null)
  const [recovered, setRecovered] = useState<StoredActivity | null>(null)
  const [screenLocked, setScreenLocked] = useState(false)
  const [kmMarker, setKmMarker] = useState<{ kilometer: number; seconds: number } | null>(null)

  /*
   * `useCallback` e não uma função solta: ela entra na lista de dependências
   * de metade dos controles abaixo. Recriada a cada render, invalidaria todos
   * eles a cada segundo — e o lint estaria certo em reclamar.
   */
  const engine = useCallback(() => {
    engineRef.current ??= new ActivityTrackingEngine(sport, weightKg ? { weightKg } : {})
    return engineRef.current
  }, [sport, weightKg])

  /*
   * O retrato é recalculado por relógio, e não só quando chega ponto.
   *
   * Sem isso o cronômetro só andaria quando o GPS falasse — e ele fica quieto
   * em túnel, em pausa e com sinal ruim, justamente quando a pessoa mais olha
   * para a tela em busca de sinal de vida.
   */
  useEffect(() => {
    const relogio = setInterval(() => {
      if (!engineRef.current) return
      setSnapshot(engineRef.current.snapshot())

      for (const evento of engineRef.current.drainEvents()) {
        if (evento.type === 'MARCO_KM') {
          setKmMarker({ kilometer: evento.kilometer, seconds: evento.seconds })
          vibrar([200, 80, 200])
        }
      }
    }, 1000)

    return () => clearInterval(relogio)
  }, [])

  // ── Recuperação ───────────────────────────────────────────────────────────
  useEffect(() => {
    void findUnfinishedActivity().then((encontrada) => {
      if (encontrada && encontrada.points.length > 0) setRecovered(encontrada)
    })
  }, [])

  const resumeRecovered = useCallback((guardada: StoredActivity) => {
    engineRef.current = ActivityTrackingEngine.restore({
      sport: guardada.sport,
      points: guardada.points,
      startedAt: guardada.startedAt,
      pausedMs: guardada.pausedMs,
      state: 'PAUSED',
    })
    clientIdRef.current = guardada.clientId
    setRecovered(null)
    setSnapshot(engineRef.current.snapshot())
  }, [])

  const discardRecovered = useCallback(async (clientId: string) => {
    await discardLocalActivity(clientId)
    setRecovered(null)
  }, [])

  // ── GPS ───────────────────────────────────────────────────────────────────
  const persistir = useCallback(() => {
    const atual = engineRef.current
    if (!atual || atual.startedAt === null) return

    void saveLocalActivity({
      clientId: clientIdRef.current,
      sport,
      startedAt: atual.startedAt,
      pausedMs: 0,
      points: [...atual.trackPoints],
      syncStatus: 'pending',
      finishedAt: null,
      updatedAt: Date.now(),
    })
  }, [sport])

  const onPosition = useCallback(
    (posicao: GeolocationPosition) => {
      const ponto: RawPoint = {
        latitude: posicao.coords.latitude,
        longitude: posicao.coords.longitude,
        altitude: posicao.coords.altitude,
        accuracy: posicao.coords.accuracy,
        speed: posicao.coords.speed,
        heading: posicao.coords.heading,
        timestamp: posicao.timestamp,
      }

      const resultado = engine().addPoint(ponto)
      setSnapshot(engine().snapshot())

      // Só grava quando entrou ponto novo: gravar a cada leitura recusada
      // encheria o IndexedDB de escrita à toa com a pessoa parada.
      if (resultado.accepted) persistir()
    },
    [engine, persistir],
  )

  const startWatching = useCallback(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setError('Este aparelho não oferece localização ao navegador.')
      return
    }

    if (watchRef.current !== null) return

    engine().transition('procurarGps')
    setSnapshot(engine().snapshot())

    watchRef.current = navigator.geolocation.watchPosition(
      (posicao) => {
        setPermission('granted')
        setError(null)

        // O primeiro sinal aceitável libera o botão de começar.
        if (engine().state === 'GPS_SEARCHING' && posicao.coords.accuracy <= 30) {
          engine().transition('sinalPronto')
        }

        onPosition(posicao)
      },
      (falha) => {
        if (falha.code === falha.PERMISSION_DENIED) {
          setPermission('denied')
          setError(
            'Sem acesso à localização não há como medir distância. Libere nas configurações do navegador e volte.',
          )
          return
        }

        setError(
          falha.code === falha.TIMEOUT
            ? 'Sinal de GPS fraco. Continuamos tentando — céu aberto ajuda.'
            : 'Não foi possível obter sua localização agora.',
        )
      },
      {
        // Alta precisão é o que dá pace confiável, e é o que consome bateria.
        // Numa atividade física, a troca vale: o número errado não serve.
        enableHighAccuracy: true,
        timeout: 15_000,
        maximumAge: 0,
      },
    )
  }, [engine, onPosition])

  const stopWatching = useCallback(() => {
    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current)
      watchRef.current = null
    }
  }, [])

  useEffect(() => stopWatching, [stopWatching])

  // ── Tela acesa ────────────────────────────────────────────────────────────
  const manterTelaAcesa = useCallback(async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen')
      }
    } catch {
      // Bateria baixa e alguns navegadores recusam. A corrida continua; o que
      // se perde é a tela ficar acesa sozinha.
    }
  }, [])

  const liberarTela = useCallback(() => {
    void wakeLockRef.current?.release()
    wakeLockRef.current = null
  }, [])

  /*
   * O sistema solta o wake lock sozinho quando a aba sai de foco. Ao voltar,
   * pedir de novo — senão a tela apaga no meio da corrida logo depois da
   * primeira notificação que a pessoa abrir.
   */
  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState === 'visible' && engineRef.current?.state === 'RUNNING') {
        void manterTelaAcesa()
      }
    }

    document.addEventListener('visibilitychange', aoVoltar)
    return () => document.removeEventListener('visibilitychange', aoVoltar)
  }, [manterTelaAcesa])

  // ── Controles ─────────────────────────────────────────────────────────────
  const start = useCallback(() => {
    engine().transition('contagem')
    engine().transition('iniciar')
    setSnapshot(engine().snapshot())
    void manterTelaAcesa()
    vibrar(300)
  }, [engine, manterTelaAcesa])

  const pause = useCallback(() => {
    engine().transition('pausar')
    setSnapshot(engine().snapshot())
  }, [engine])

  const resume = useCallback(() => {
    engine().transition('retomar')
    setSnapshot(engine().snapshot())
  }, [engine])

  const finish = useCallback(() => {
    engine().transition('finalizar')
    engine().transition('concluir')
    const final = engine().snapshot()
    setSnapshot(final)
    stopWatching()
    liberarTela()

    const atual = engineRef.current
    if (atual?.startedAt) {
      void saveLocalActivity({
        clientId: clientIdRef.current,
        sport,
        startedAt: atual.startedAt,
        pausedMs: 0,
        points: [...atual.trackPoints],
        syncStatus: 'pending',
        finishedAt: Date.now(),
        updatedAt: Date.now(),
      })
    }

    return {
      snapshot: final,
      points: [...(atual?.trackPoints ?? [])],
      clientId: clientIdRef.current,
    }
  }, [engine, liberarTela, sport, stopWatching])

  const discard = useCallback(async () => {
    stopWatching()
    liberarTela()
    await discardLocalActivity(clientIdRef.current)
    engineRef.current = null
    clientIdRef.current = newClientId()
    setSnapshot(RETRATO_VAZIO)
  }, [liberarTela, stopWatching])

  return {
    snapshot,
    permission,
    error,
    recovered,
    screenLocked,
    kmMarker,
    points: engineRef.current?.trackPoints ?? [],
    clientId: clientIdRef.current,
    startWatching,
    start,
    pause,
    resume,
    finish,
    discard,
    resumeRecovered,
    discardRecovered,
    setScreenLocked,
    dismissKmMarker: () => setKmMarker(null),
  }
}

/** Vibração é enfeite: onde não existe, o resto continua igual. */
function vibrar(padrao: number | number[]): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(padrao)
  } catch {
    /* iOS não vibra a partir do navegador. */
  }
}
