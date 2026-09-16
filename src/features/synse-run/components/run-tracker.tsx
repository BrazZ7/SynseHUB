'use client'

import { useRouter } from 'next/navigation'
import { Lock, Pause, Play, Square, Unlock } from 'lucide-react'
import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { GpsBadge, Metric } from '@/features/synse-run/components/metric'
import { RouteMap } from '@/features/synse-run/components/route-map'
import { saveActivityAction } from '@/features/synse-run/actions'
import {
  formatDistance,
  formatDuration,
  formatPace,
  formatSpeed,
  SPORT_LABELS,
} from '@/features/synse-run/format'
import type { SportType } from '@/features/synse-run/engine/types'
import { useActivityTracker } from '@/features/synse-run/use-activity-tracker'
import { markSynced } from '@/features/synse-run/storage/local-activity'
import { cn } from '@/lib/utils'

/**
 * A tela da corrida.
 *
 * Ela existe em quatro momentos, e cada um mostra uma coisa diferente:
 * procurando sinal, pronta para começar, correndo, e a confirmação de
 * encerrar. Um componente só, porque o estado é contínuo — trocar de rota no
 * meio da corrida seria arriscar perder tudo numa navegação.
 */
export function RunTracker({ sport }: { sport: SportType }) {
  const router = useRouter()
  const tracker = useActivityTracker(sport)
  const [confirmandoFim, setConfirmandoFim] = useState(false)
  const [salvando, iniciarSalvamento] = useTransition()
  const [erroAoSalvar, setErroAoSalvar] = useState<string | null>(null)

  const { snapshot } = tracker
  const estado = snapshot.state
  const correndo = estado === 'RUNNING' || estado === 'AUTO_PAUSED' || estado === 'PAUSED'

  function finalizar() {
    const { snapshot: final, points, clientId } = tracker.finish()

    iniciarSalvamento(async () => {
      const resultado = await saveActivityAction({
        clientId,
        sport,
        title: null,
        startedAt: new Date(points[0]?.timestamp ?? Date.now()).toISOString(),
        endedAt: new Date().toISOString(),
        elapsedSeconds: final.elapsedSeconds,
        movingSeconds: final.movingSeconds,
        distanceMeters: final.distance,
        averagePace: final.averagePace,
        bestPace: final.bestPace,
        averageSpeed: final.averageSpeed,
        maxSpeed: final.maxSpeed,
        elevationGain: final.elevationGain,
        elevationLoss: final.elevationLoss,
        minAltitude: final.minAltitude,
        maxAltitude: final.maxAltitude,
        calories: final.calories,
        privacy: 'GYM',
        route: points.map((ponto) => ({
          latitude: ponto.latitude,
          longitude: ponto.longitude,
          altitude: ponto.altitude,
          speed: ponto.speed,
          accuracy: ponto.accuracy,
          heading: ponto.heading,
          recordedAt: new Date(ponto.timestamp).toISOString(),
          distanceFromPrevious: ponto.distanceFromPrevious,
          totalDistance: ponto.totalDistance,
        })),
        splits: final.splits.map((parcial) => ({
          kilometer: parcial.kilometer,
          splitSeconds: parcial.seconds,
          paceSeconds: parcial.paceSecondsPerKm,
          elevationGain: parcial.elevationGain,
        })),
      })

      if (resultado.status === 'success') {
        await markSynced(clientId)
        router.push(`/app/run/${resultado.activityId}`)
        return
      }

      /*
       * Falhar ao salvar não pode perder a corrida: ela continua gravada no
       * aparelho, e a mensagem diz isso. Ninguém corre 40 minutos para receber
       * "tente novamente" e ficar sem nada.
       */
      setErroAoSalvar(resultado.message)
    })
  }

  // ── Antes de começar ──────────────────────────────────────────────────────
  if (!correndo && estado !== 'FINISHED') {
    return (
      <div className="space-y-5">
        <section className="rounded-2xl border border-synse-border bg-synse-surface p-6 text-center shadow-synse-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-synse-primary">
            {SPORT_LABELS[sport]} ao ar livre
          </p>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <GpsBadge quality={snapshot.gpsQuality} />
            {tracker.lastFix && (
              <span className="text-xs text-synse-muted">
                margem de {Math.round(tracker.lastFix.accuracy)} m
              </span>
            )}
          </div>

          {/*
            O mapa antes de começar mostra onde o aparelho acha que você está,
            com o círculo da margem. Dentro de casa ele se localiza por Wi-Fi e
            erra fácil algumas centenas de metros — ver o círculo enorme explica
            de imediato por que o botão não libera.
          */}
          {tracker.lastFix && <RouteMap points={[tracker.lastFix]} live className="mt-4 h-40" />}

          <p className="mt-4 text-sm text-synse-muted">
            {tracker.permission === 'denied'
              ? 'Sem acesso à localização não há como medir distância.'
              : estado === 'READY'
                ? 'Localização adquirida. É só começar.'
                : 'O SynseRun usa sua localização durante a atividade para registrar distância, ritmo e percurso.'}
          </p>

          {tracker.error && (
            <p role="alert" className="mt-3 text-sm text-synse-danger">
              {tracker.error}
            </p>
          )}

          <div className="mt-5">
            {estado === 'IDLE' || estado === 'ERROR' ? (
              <Button size="lg" className="w-full" onClick={tracker.startWatching}>
                Preparar GPS
              </Button>
            ) : (
              <Button
                size="lg"
                variant="gradient"
                className="w-full"
                disabled={estado !== 'READY'}
                onClick={tracker.start}
              >
                {estado === 'READY' ? 'COMEÇAR' : 'Procurando sinal…'}
              </Button>
            )}
          </div>
        </section>

        {/* Corrida interrompida, esperando decisão */}
        {tracker.recovered && (
          <section className="border-synse-primary/40 rounded-2xl border bg-synse-surface p-5 shadow-synse-sm">
            <h2 className="text-sm font-semibold text-synse-text">
              Encontramos uma corrida em andamento
            </h2>
            <p className="mt-1 text-sm text-synse-muted">
              {formatDistance(
                tracker.recovered.points[tracker.recovered.points.length - 1]?.totalDistance ?? 0,
              )}{' '}
              km registrados, de{' '}
              {new Date(tracker.recovered.startedAt).toLocaleString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
              .
            </p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => tracker.resumeRecovered(tracker.recovered!)}>
                Continuar
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void tracker.discardRecovered(tracker.recovered!.clientId)}
              >
                Descartar
              </Button>
            </div>
          </section>
        )}
      </div>
    )
  }

  // ── Correndo ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Aviso de quilômetro */}
      {tracker.kmMarker && (
        <button
          type="button"
          onClick={tracker.dismissKmMarker}
          className="w-full animate-fade-in-up rounded-2xl bg-synse-gradient p-5 text-center text-white shadow-glow"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
            KM {tracker.kmMarker.kilometer} completo
          </p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">
            {formatPace(tracker.kmMarker.seconds)}
          </p>
        </button>
      )}

      <section className="relative overflow-hidden rounded-2xl bg-synse-gradient-deep p-6 text-white shadow-synse-lg">
        <div
          aria-hidden
          className="bg-synse-primary/25 pointer-events-none absolute -right-16 -top-16 size-52 rounded-full blur-3xl"
        />

        <div className="relative text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">Tempo</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-white/90">
            {formatDuration(snapshot.elapsedSeconds)}
          </p>

          <p className="mt-5 text-7xl font-semibold tabular-nums leading-none">
            {formatDistance(snapshot.distance)}
          </p>
          <p className="mt-1 text-sm font-medium uppercase tracking-[0.2em] text-white/60">km</p>

          <div className="mt-5 rounded-xl bg-white/10 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/60">
              Pace atual
            </p>
            <p className="text-3xl font-semibold tabular-nums">
              {formatPace(snapshot.currentPace)}
              <span className="ml-1 text-sm font-normal text-white/60">/km</span>
            </p>
          </div>

          {estado === 'AUTO_PAUSED' && (
            <p className="mt-4 rounded-lg bg-white/15 px-3 py-2 text-sm">
              Corrida pausada automaticamente — volte a se mover para retomar.
            </p>
          )}
          {estado === 'PAUSED' && (
            <p className="mt-4 rounded-lg bg-white/15 px-3 py-2 text-sm">Corrida pausada.</p>
          )}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        {[
          { label: 'Pace médio', value: formatPace(snapshot.averagePace), unit: '/km' },
          { label: 'Velocidade', value: formatSpeed(snapshot.currentSpeed), unit: 'km/h' },
          { label: 'Elevação', value: `+${snapshot.elevationGain}`, unit: 'm' },
          { label: 'Calorias', value: String(snapshot.calories), unit: 'kcal' },
        ].map((metrica) => (
          <div
            key={metrica.label}
            className="rounded-2xl border border-synse-border bg-synse-surface p-4 shadow-synse-sm"
          >
            <Metric {...metrica} />
          </div>
        ))}
      </section>

      <RouteMap
        points={
          tracker.points.length > 0 ? tracker.points : tracker.lastFix ? [tracker.lastFix] : []
        }
        live
        className="h-56"
      />

      {/* Parciais */}
      {snapshot.splits.length > 0 && (
        <section className="rounded-2xl border border-synse-border bg-synse-surface p-4 shadow-synse-sm">
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-synse-muted">
            Parciais
          </h2>
          <ul className="mt-2 space-y-1">
            {snapshot.splits.map((parcial) => (
              <li
                key={parcial.kilometer}
                className="flex items-center justify-between text-sm text-synse-text"
              >
                <span className="text-synse-muted">KM {parcial.kilometer}</span>
                <span className="tabular-nums">{formatPace(parcial.paceSecondsPerKm)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {erroAoSalvar && (
        <p role="alert" className="bg-synse-warning/10 rounded-xl p-4 text-sm text-synse-text">
          {erroAoSalvar}
        </p>
      )}

      {/* Controles */}
      <section
        className={cn(
          'sticky bottom-24 grid gap-2',
          tracker.screenLocked ? 'grid-cols-1' : 'grid-cols-3',
        )}
      >
        {tracker.screenLocked ? (
          <Button
            variant="outline"
            size="lg"
            /*
             * Desbloqueia com toque longo, e não com um toque: o objetivo do
             * bloqueio é justamente resistir ao toque acidental do braço
             * balançando dentro da manga.
             */
            onPointerDown={(evento) => {
              const alvo = evento.currentTarget
              const tempo = setTimeout(() => tracker.setScreenLocked(false), 800)
              const cancelar = () => {
                clearTimeout(tempo)
                alvo.removeEventListener('pointerup', cancelar)
                alvo.removeEventListener('pointerleave', cancelar)
              }
              alvo.addEventListener('pointerup', cancelar)
              alvo.addEventListener('pointerleave', cancelar)
            }}
          >
            <Unlock className="size-4" />
            Segure para desbloquear
          </Button>
        ) : (
          <>
            {estado === 'PAUSED' ? (
              <Button size="lg" onClick={tracker.resume}>
                <Play className="size-4" />
                Continuar
              </Button>
            ) : (
              <Button size="lg" variant="outline" onClick={tracker.pause}>
                <Pause className="size-4" />
                Pausar
              </Button>
            )}

            <Button size="lg" variant="destructive" onClick={() => setConfirmandoFim(true)}>
              <Square className="size-4" />
              Finalizar
            </Button>

            <Button size="lg" variant="outline" onClick={() => tracker.setScreenLocked(true)}>
              <Lock className="size-4" />
              Bloquear
            </Button>
          </>
        )}
      </section>

      {/* Confirmação: finalizar sem querer é perder a corrida */}
      {confirmandoFim && (
        <div className="bg-synse-dark/60 fixed inset-0 z-50 flex items-end justify-center p-5 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-sm rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-lg">
            <h2 className="text-base font-semibold text-synse-text">Finalizar atividade?</h2>
            <p className="mt-1 text-sm text-synse-muted">
              {formatDistance(snapshot.distance)} km em {formatDuration(snapshot.elapsedSeconds)}.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => setConfirmandoFim(false)}>
                Cancelar
              </Button>
              <Button variant="destructive" disabled={salvando} onClick={finalizar}>
                {salvando ? 'Salvando…' : 'Finalizar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
