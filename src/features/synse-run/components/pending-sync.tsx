'use client'

import { useEffect, useState } from 'react'

import { saveActivityAction } from '@/features/synse-run/actions'
import {
  findPendingUploads,
  markSynced,
  type StoredActivity,
} from '@/features/synse-run/storage/local-activity'

/**
 * Sobe as corridas que ficaram no aparelho.
 *
 * GPS não depende de internet, então correr sem rede é normal — no meio do
 * mato é o caso comum. A corrida termina, fica guardada, e sobe quando houver
 * rede: aqui, ao abrir o SynseRun, e no evento `online`.
 *
 * Não desenha nada enquanto não há o que subir. Uma faixa "tudo sincronizado"
 * seria ruído permanente para informar o estado normal.
 */
export function PendingSync() {
  const [pendentes, setPendentes] = useState<StoredActivity[]>([])
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    let ativo = true

    const tentar = async () => {
      const guardadas = await findPendingUploads()
      if (!ativo || guardadas.length === 0) {
        if (ativo) setPendentes([])
        return
      }

      setPendentes(guardadas)
      if (!navigator.onLine) return

      setEnviando(true)

      for (const corrida of guardadas) {
        const pontos = corrida.points
        if (pontos.length === 0) continue

        const resultado = await saveActivityAction({
          clientId: corrida.clientId,
          sport: corrida.sport,
          title: null,
          startedAt: new Date(corrida.startedAt).toISOString(),
          endedAt: new Date(corrida.finishedAt ?? Date.now()).toISOString(),
          elapsedSeconds: (pontos[pontos.length - 1].timestamp - corrida.startedAt) / 1000,
          // O servidor recalcula tudo a partir da rota; o que vai daqui é o
          // que ele não tem como saber — quanto tempo esteve em movimento.
          movingSeconds: (pontos[pontos.length - 1].timestamp - corrida.startedAt) / 1000,
          distanceMeters: pontos[pontos.length - 1].totalDistance,
          averagePace: null,
          bestPace: null,
          averageSpeed: 0,
          maxSpeed: 0,
          elevationGain: 0,
          elevationLoss: 0,
          minAltitude: null,
          maxAltitude: null,
          calories: 0,
          privacy: 'GYM',
          route: pontos.map((ponto) => ({
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
          splits: [],
        })

        if (resultado.status === 'success') await markSynced(corrida.clientId)
      }

      if (!ativo) return
      setEnviando(false)
      setPendentes(await findPendingUploads())
    }

    void tentar()
    window.addEventListener('online', tentar)

    return () => {
      ativo = false
      window.removeEventListener('online', tentar)
    }
  }, [])

  if (pendentes.length === 0) return null

  return (
    <p className="rounded-xl bg-synse-surface-2 p-4 text-sm text-synse-muted" role="status">
      {enviando
        ? `Enviando ${pendentes.length} ${pendentes.length === 1 ? 'atividade' : 'atividades'} que ficaram no aparelho…`
        : `${pendentes.length} ${pendentes.length === 1 ? 'atividade guardada' : 'atividades guardadas'} no aparelho. Sobem sozinhas quando houver internet.`}
    </p>
  )
}
