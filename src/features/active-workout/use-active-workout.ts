'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  criarSessao,
  duracaoEfetiva,
  exercicioAtual,
  progresso,
  reduzir,
  reidratar,
  restanteDoDescanso,
} from '@/features/active-workout/engine/workout-engine'
import type {
  PlannedExercise,
  WorkoutEvent,
  WorkoutSession,
  WorkoutSettings,
} from '@/features/active-workout/engine/types'
import { criarFeedback, criarLiveActivity } from '@/features/active-workout/platform'
import type { LiveWorkoutState } from '@/features/active-workout/platform/types'
import {
  enfileirar,
  limparSessao,
  lerSessao,
  salvarSessao,
} from '@/features/active-workout/storage/local-workout'
import { resumoDoTreino, type ResumoDoTreino } from '@/features/active-workout/state'
import { sincronizar } from '@/features/active-workout/sync'

/**
 * A ligação entre o engine e a tela.
 *
 * O engine não sabe que React existe; este hook é quem traduz. Ele cuida de
 * quatro coisas que o engine deliberadamente não faz: gravar no aparelho,
 * empurrar a fila, falar com a tela bloqueada, e acordar quando o descanso
 * vence.
 *
 * O cronômetro **não** vive aqui. Ele está em `useRestCountdown`, abaixo, e é
 * usado só pelo componente que mostra o número — senão a tela inteira
 * redesenharia uma vez por segundo durante todo o descanso.
 */

const id = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`

export function useActiveWorkout() {
  const [sessao, setSessao] = useState<WorkoutSession | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [pendentes, setPendentes] = useState(0)
  /*
   * O que a fila desistiu de enviar. Antes de existir, a operação esgotada
   * ficava rodando e o contador nunca chegava a zero: a tela dizia
   * "3 a sincronizar" para sempre, sem explicar e sem resolver.
   */
  const [resumoDaFila, setResumoDaFila] = useState<ResumoDoTreino>(null)

  const liveActivity = useMemo(() => criarLiveActivity(), [])
  const feedback = useMemo(() => criarFeedback(), [])
  const serverIdRef = useRef<string | null>(null)
  /*
   * Trava do toque duplo na camada da interface. O engine já ignora o
   * `clientId` repetido e o banco tem unicidade, mas sem isto dois toques
   * rápidos gerariam dois `clientId` diferentes para a mesma série — e aí as
   * duas defesas de baixo não teriam como saber que é a mesma coisa.
   */
  const concluindoRef = useRef(false)

  // ── Recuperação ────────────────────────────────────────────────────────────
  useEffect(() => {
    let vivo = true
    void (async () => {
      const guardada = await lerSessao()
      if (!vivo) return
      if (guardada && guardada.state !== 'WORKOUT_COMPLETED') {
        serverIdRef.current = guardada.serverId
        // Reidratar antes de mostrar: o descanso pode ter vencido enquanto o
        // app estava fechado, e reiniciar o cronômetro seria mentir.
        setSessao(reidratar(guardada, Date.now()))
      }
      setCarregando(false)
    })()
    return () => {
      vivo = false
    }
  }, [])

  // ── Persistência ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (sessao) void salvarSessao(sessao)
  }, [sessao])

  // ── Tela bloqueada ─────────────────────────────────────────────────────────
  const paraLiveActivity = useCallback((s: WorkoutSession): LiveWorkoutState | null => {
    const exercicio = exercicioAtual(s)
    if (!exercicio) return null
    return {
      exerciseName: exercicio.name,
      setNumber: s.setNumber,
      totalSets: exercicio.sets,
      reps: s.currentReps,
      weight: s.currentWeight,
      phase: s.state === 'RESTING' ? 'REST' : s.state === 'REST_FINISHED' ? 'REST_FINISHED' : 'SET',
      restEndsAt: s.restEndsAt,
      progress: progresso(s),
    }
  }, [])

  useEffect(() => {
    if (!sessao) return
    const estado = paraLiveActivity(sessao)
    if (!estado) return

    if (sessao.state === 'WORKOUT_COMPLETED') {
      void liveActivity.stop()
      void feedback.keepAwake(false)
      return
    }
    void liveActivity.update(estado)
  }, [sessao, liveActivity, feedback, paraLiveActivity])

  // ── O despertador do descanso ──────────────────────────────────────────────
  useEffect(() => {
    if (!sessao || sessao.state !== 'RESTING' || !sessao.restEndsAt) return

    /*
     * Um único `setTimeout` mirando o instante do fim, e não um intervalo de um
     * segundo. Em segundo plano o navegador atrasa o disparo, então a volta do
     * app recalcula pelo `restEndsAt` de qualquer jeito — este temporizador é
     * para quem está com a tela aberta.
     */
    const faltam = sessao.restEndsAt - Date.now()
    const timer = setTimeout(() => {
      const agora = Date.now()
      setSessao((atual) => (atual ? reduzir(atual, { type: 'REST_ELAPSED', agora }) : atual))

      if (sessao.settings.vibration) feedback.vibrate([200, 100, 200])
      const estado = paraLiveActivity(sessao)
      if (estado) void liveActivity.restFinished({ ...estado, phase: 'REST_FINISHED' })
    }, Math.max(faltam, 0))

    return () => clearTimeout(timer)
  }, [sessao, feedback, liveActivity, paraLiveActivity])

  // ── Sincronização ──────────────────────────────────────────────────────────
  const empurrarFila = useCallback(async () => {
    const resultado = await sincronizar(serverIdRef.current)
    if (resultado.sessionId && resultado.sessionId !== serverIdRef.current) {
      serverIdRef.current = resultado.sessionId
      setSessao((atual) => (atual ? { ...atual, serverId: resultado.sessionId } : atual))
    }
    setPendentes(resultado.pendentes)
    setResumoDaFila(
      resumoDoTreino({
        pendentes: resultado.pendentes,
        treinosPerdidos: resultado.treinosPerdidos,
        seriesPerdidas: resultado.seriesPerdidas,
      }),
    )
  }, [])

  useEffect(() => {
    if (!sessao) return
    void empurrarFila()

    // A volta da rede é o momento óbvio de tentar de novo.
    const aoConectar = () => void empurrarFila()
    /*
     * E a volta do segundo plano também: no aplicativo, o evento `online` pode
     * ter acontecido com o processo suspenso, sem ninguém para ouvir. Sem isto,
     * o treino ficava pendente até a pessoa tocar em alguma coisa.
     */
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') void empurrarFila()
    }

    window.addEventListener('online', aoConectar)
    document.addEventListener('visibilitychange', aoVoltar)

    return () => {
      window.removeEventListener('online', aoConectar)
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [sessao?.completedSets.length, sessao?.state, empurrarFila, sessao])

  // ── Ações ──────────────────────────────────────────────────────────────────
  const despachar = useCallback((evento: WorkoutEvent) => {
    setSessao((atual) => (atual ? reduzir(atual, evento) : atual))
  }, [])

  const iniciar = useCallback(
    async (input: {
      workoutPlanId: string | null
      planName: string
      exercises: PlannedExercise[]
      settings?: Partial<WorkoutSettings>
    }) => {
      const agora = Date.now()
      const clientId = id()
      const nova = reduzir(
        criarSessao({ clientId, ...input, agora }),
        { type: 'START', agora },
      )
      setSessao(nova)

      await enfileirar({
        kind: 'START',
        clientId,
        workoutPlanId: input.workoutPlanId,
        tentativas: 0,
      })

      /*
       * A permissão é pedida aqui, no primeiro treino — não na abertura do app.
       * Quem acabou de instalar não tem contexto para decidir; quem apertou
       * "começar treino" tem.
       */
      if (await liveActivity.isSupported()) await liveActivity.requestPermission()
      if (nova.settings.keepScreenAwake) await feedback.keepAwake(true)

      const estado = paraLiveActivity(nova)
      if (estado) await liveActivity.start(estado)
      void empurrarFila()
    },
    [liveActivity, feedback, paraLiveActivity, empurrarFila],
  )

  const concluirSerie = useCallback(async () => {
    if (!sessao || concluindoRef.current) return
    concluindoRef.current = true

    try {
      const agora = Date.now()
      const clientId = id()
      const exercicio = exercicioAtual(sessao)
      if (!exercicio) return

      const depois = reduzir(sessao, { type: 'COMPLETE_SET', agora, clientId })
      // O engine devolve a mesma sessão quando ignora o evento; não enfileira.
      if (depois === sessao) return
      setSessao(depois)

      await enfileirar({
        kind: 'SET',
        clientId,
        sessionClientId: sessao.clientId,
        exerciseId: exercicio.exerciseId,
        setNumber: sessao.setNumber,
        repsPlanned: Number.isFinite(Number(exercicio.reps)) ? Number(exercicio.reps) : null,
        repsCompleted: sessao.currentReps,
        weight: sessao.currentWeight,
        restSeconds: exercicio.restSeconds,
        startedAt: sessao.setStartedAt,
        completedAt: agora,
        tentativas: 0,
      })

      if (sessao.settings.vibration) feedback.vibrate([40])
      void empurrarFila()
    } finally {
      // Curto o bastante para não atrapalhar quem treina rápido, longo o
      // bastante para absorver o toque duplo.
      setTimeout(() => {
        concluindoRef.current = false
      }, 400)
    }
  }, [sessao, feedback, empurrarFila])

  const encerrar = useCallback(
    async (status: 'COMPLETED' | 'ABANDONED' = 'COMPLETED') => {
      if (!sessao) return
      const agora = Date.now()
      const final = reduzir(sessao, { type: 'FINISH', agora })
      setSessao(final)

      await enfileirar({
        kind: 'FINISH',
        clientId: id(),
        sessionClientId: sessao.clientId,
        durationSeconds: duracaoEfetiva(final, agora),
        status,
        tentativas: 0,
      })

      await liveActivity.stop()
      await feedback.keepAwake(false)
      void empurrarFila()
    },
    [sessao, liveActivity, feedback, empurrarFila],
  )

  const descartar = useCallback(async () => {
    await limparSessao()
    await liveActivity.stop()
    await feedback.keepAwake(false)
    setSessao(null)
  }, [liveActivity, feedback])

  return {
    sessao,
    carregando,
    pendentes,
    resumoDaFila,
    iniciar,
    concluirSerie,
    encerrar,
    descartar,
    despachar,
    exercicio: sessao ? exercicioAtual(sessao) : undefined,
    progresso: sessao ? progresso(sessao) : 0,
  }
}

/**
 * O cronômetro, isolado.
 *
 * Vive sozinho porque é o único pedaço que precisa redesenhar a cada segundo.
 * Usado dentro do componente que mostra o número, mantém o resto da tela — os
 * botões grandes, a lista de séries, o progresso — fora do ciclo.
 *
 * O valor vem sempre de `restEndsAt - agora`. O intervalo só existe para
 * provocar o redesenho; ele não guarda contagem nenhuma, então atrasar ou
 * perder um tique não acumula erro.
 */
export function useRestCountdown(restEndsAt: number | null): number {
  const [restante, setRestante] = useState(() =>
    restEndsAt ? Math.max(Math.ceil((restEndsAt - Date.now()) / 1000), 0) : 0,
  )

  useEffect(() => {
    if (!restEndsAt) {
      setRestante(0)
      return
    }

    const calcular = () => setRestante(Math.max(Math.ceil((restEndsAt - Date.now()) / 1000), 0))
    calcular()
    const intervalo = setInterval(calcular, 250)

    /*
     * A volta do segundo plano recalcula na hora, sem esperar o próximo tique:
     * o número precisa estar certo no instante em que a tela reaparece.
     */
    const aoVoltar = () => document.visibilityState === 'visible' && calcular()
    document.addEventListener('visibilitychange', aoVoltar)

    return () => {
      clearInterval(intervalo)
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [restEndsAt])

  return restante
}

export { restanteDoDescanso }
