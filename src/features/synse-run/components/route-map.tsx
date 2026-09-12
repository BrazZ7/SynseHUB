'use client'

import { useEffect, useRef, useState } from 'react'

// O CSS entra no topo: é folha de estilo, não toca `window`, e o bundler
// resolve na compilação. Só o JavaScript do Leaflet precisa esperar o cliente.
import 'leaflet/dist/leaflet.css'

import { cn } from '@/lib/utils'

export type MapPoint = { latitude: number; longitude: number; accuracy?: number | null }

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
  const precisaoRef = useRef<L.Circle | null>(null)

  /*
   * O mapa nasce assíncrono, e a rota costuma chegar antes dele.
   *
   * Sem este estado, o efeito que desenha rodava com `mapRef` ainda nulo,
   * desistia, e nunca mais rodava — as dependências não mudam depois. O
   * resultado aparecia como "localização errada": a página de detalhe mostrava
   * o centro padrão do mapa, sem rota nenhuma desenhada em cima.
   */
  const [pronto, setPronto] = useState(false)

  const primeiro = points[0]

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

      /*
       * Enquadra o primeiro ponto real. Antes havia um centro fixo em São
       * Paulo, e ele aparecia como se fosse o percurso de quem correu em outra
       * cidade — um mapa mentindo é pior que mapa nenhum.
       */
      mapa.setView([primeiro.latitude, primeiro.longitude], 16)

      mapRef.current = mapa
      setPronto(true)
    })()

    return () => {
      cancelado = true
      mapRef.current?.remove()
      mapRef.current = null
      lineRef.current = null
      markerRef.current = null
      precisaoRef.current = null
      setPronto(false)
    }
    // `primeiro` só posiciona a câmera inicial; mudanças depois são tratadas
    // no efeito de desenho, sem recriar o mapa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live])

  useEffect(() => {
    const mapa = mapRef.current
    if (!pronto || !mapa || points.length === 0) return

    void (async () => {
      const L = (await import('leaflet')).default
      const coordenadas = points.map((p) => [p.latitude, p.longitude] as [number, number])
      const ultimo = coordenadas[coordenadas.length - 1]

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

      /*
       * O círculo de incerteza é a informação que faltava.
       *
       * Dentro de casa o aparelho se localiza por Wi-Fi e erra fácil algumas
       * centenas de metros — o ponto aparece confiante no lugar errado, e quem
       * olha conclui que o app está quebrado. Desenhar o raio que o próprio
       * aparelho declara mostra o tamanho da dúvida.
       */
      const precisao = points[points.length - 1]?.accuracy
      if (live && typeof precisao === 'number' && precisao > 0) {
        if (precisaoRef.current) {
          precisaoRef.current.setLatLng(ultimo).setRadius(precisao)
        } else {
          precisaoRef.current = L.circle(ultimo, {
            radius: precisao,
            color: '#12b981',
            weight: 1,
            opacity: 0.4,
            fillColor: '#12b981',
            fillOpacity: 0.08,
          }).addTo(mapa)
        }
      }

      if (live) {
        mapa.setView(ultimo, Math.max(mapa.getZoom(), 16), { animate: true })
      } else if (coordenadas.length > 1) {
        mapa.fitBounds(L.latLngBounds(coordenadas), { padding: [24, 24] })
      }
    })()
  }, [points, live, pronto])

  /*
   * Sem ponto nenhum não há mapa. Mostrar azulejos de um lugar qualquer
   * enquanto o GPS não responde é convidar a pessoa a achar que o app a
   * localizou — e localizou errado.
   */
  if (!primeiro) {
    return (
      <div
        className={cn(
          'grid w-full place-items-center rounded-2xl border border-dashed border-synse-border bg-synse-surface-2 p-6 text-center',
          className,
        )}
        style={{ minHeight: 220 }}
      >
        <p className="text-sm text-synse-muted">
          O mapa aparece quando o GPS confirmar sua posição.
        </p>
      </div>
    )
  }

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
