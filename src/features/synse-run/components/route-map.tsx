'use client'

import { useEffect, useRef } from 'react'

// O CSS entra no topo: é folha de estilo, não toca `window`, e o bundler
// resolve na compilação. Só o JavaScript do Leaflet precisa esperar o cliente.
import 'leaflet/dist/leaflet.css'

import { cn } from '@/lib/utils'

export type MapPoint = { latitude: number; longitude: number }

/**
 * Mapa da rota.
 *
 * Leaflet carregado sob demanda, com azulejos do OpenStreetMap: sem chave de
 * API, sem custo por visualização e sem amarrar o produto a um fornecedor de
 * mapa antes de existir o primeiro usuário. Trocar por Mapbox ou Google depois
 * é mudar este arquivo, e só ele.
 *
 * `import()` dentro do efeito porque Leaflet toca `window` ao ser importado, e
 * o Next renderiza no servidor primeiro — importar no topo quebraria a página
 * inteira, não só o mapa.
 */
export function RouteMap({
  points,
  className,
  live = false,
}: {
  points: readonly MapPoint[]
  className?: string
  /** Em corrida, a câmera segue o último ponto. */
  live?: boolean
}) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const lineRef = useRef<L.Polyline | null>(null)
  const markerRef = useRef<L.CircleMarker | null>(null)

  useEffect(() => {
    let cancelado = false

    void (async () => {
      const L = (await import('leaflet')).default
      if (cancelado || !container.current || mapRef.current) return

      const mapa = L.map(container.current, {
        zoomControl: false,
        attributionControl: true,
        // Numa tela de corrida, o dedo está suado e o celular balança: rolar o
        // mapa sem querer, no meio da passada, é pior que não poder rolar.
        dragging: !live,
        scrollWheelZoom: !live,
      })

      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap',
      }).addTo(mapa)

      mapa.setView([-23.5613, -46.6565], 15)
      mapRef.current = mapa
    })()

    return () => {
      cancelado = true
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [live])

  useEffect(() => {
    const mapa = mapRef.current
    if (!mapa || points.length === 0) return

    void (async () => {
      const L = (await import('leaflet')).default
      const coordenadas = points.map((p) => [p.latitude, p.longitude] as [number, number])

      if (lineRef.current) {
        lineRef.current.setLatLngs(coordenadas)
      } else {
        lineRef.current = L.polyline(coordenadas, {
          color: '#12b981',
          weight: 5,
          opacity: 0.95,
          lineJoin: 'round',
          lineCap: 'round',
        }).addTo(mapa)
      }

      const ultimo = coordenadas[coordenadas.length - 1]

      if (markerRef.current) {
        markerRef.current.setLatLng(ultimo)
      } else {
        markerRef.current = L.circleMarker(ultimo, {
          radius: 7,
          color: '#ffffff',
          weight: 3,
          fillColor: '#12b981',
          fillOpacity: 1,
        }).addTo(mapa)
      }

      if (live) {
        mapa.setView(ultimo, Math.max(mapa.getZoom(), 16), { animate: true })
      } else if (coordenadas.length > 1) {
        mapa.fitBounds(L.latLngBounds(coordenadas), { padding: [24, 24] })
      }
    })()
  }, [points, live])

  return (
    <div
      ref={container}
      className={cn(
        'w-full overflow-hidden rounded-2xl border border-synse-border bg-synse-surface-2',
        className,
      )}
      // Leaflet exige altura explícita: sem ela o contêiner colapsa e o mapa
      // some sem erro nenhum.
      style={{ minHeight: 220 }}
      role="img"
      aria-label="Mapa do percurso"
    />
  )
}
