/**
 * Aparência do mapa.
 *
 * Duas decisões moram aqui, e só aqui.
 *
 * **De onde vêm os azulejos.** O padrão é o OpenStreetMap, sem chave e sem
 * custo por visualização. Quando o produto crescer isso precisa virar um
 * fornecedor contratado — a política de uso do OSM é explícita em não servir
 * aplicação comercial de volume —, e a troca é uma variável de ambiente, não
 * uma varredura pelo código.
 *
 * **Como eles são pintados.** O OSM cru é colorido demais para uma tela de
 * corrida: estradas amarelas, parques verdes e prédios rosa competem com a
 * linha do percurso, que é a única coisa que a pessoa quer ver. Em vez de
 * pagar por um estilo pronto, o painel de azulejos recebe um filtro CSS — o
 * fundo recua para um cinza calmo, e a rota fica sozinha em evidência.
 */

export type TileSource = { url: string; attribution: string; maxZoom: number }

const OSM: TileSource = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '© OpenStreetMap',
  maxZoom: 19,
}

/**
 * Fornecedor de azulejos, configurável sem tocar no código.
 *
 * `NEXT_PUBLIC_MAP_TILE_URL` aceita qualquer serviço no formato `{z}/{x}/{y}`
 * — MapTiler, Mapbox, Thunderforest, um servidor próprio. A atribuição
 * acompanha, porque quase todos exigem a sua, e exibir a errada é pior que
 * não exibir nenhuma.
 */
export function tileSource(
  env: { url?: string; attribution?: string; maxZoom?: string } = {
    url: process.env.NEXT_PUBLIC_MAP_TILE_URL,
    attribution: process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION,
    maxZoom: process.env.NEXT_PUBLIC_MAP_TILE_MAX_ZOOM,
  },
): TileSource {
  const url = env.url?.trim()
  if (!url) return OSM

  const maxZoom = Number(env.maxZoom)
  return {
    url,
    attribution: env.attribution?.trim() || '© OpenStreetMap',
    maxZoom: Number.isFinite(maxZoom) && maxZoom > 0 ? maxZoom : 19,
  }
}

export type BasemapId = 'suave' | 'noturno' | 'detalhado'

export type Basemap = {
  id: BasemapId
  nome: string
  /** Aplicado ao painel de azulejos — nunca à rota, que fica em outro painel. */
  filtro: string
  /** Linha do percurso, escolhida para contrastar com este fundo. */
  rota: string
  /** Contorno do marcador atual: precisa se separar da linha e do fundo. */
  contorno: string
}

const BASEMAPS: Record<BasemapId, Basemap> = {
  /* Cinza claro, quase sem cor. O percurso é a única coisa saturada na tela. */
  suave: {
    id: 'suave',
    nome: 'Suave',
    filtro: 'grayscale(0.65) saturate(0.8) brightness(1.06) contrast(0.92)',
    rota: '#00a98f',
    contorno: '#ffffff',
  },
  /*
   * Inverter e girar o matiz em 180° escurece o mapa mantendo as cores
   * reconhecíveis — água continua azulada, vegetação continua esverdeada. É o
   * modo que se usa correndo à noite, quando a tela clara cega.
   */
  noturno: {
    id: 'noturno',
    nome: 'Noturno',
    filtro: 'invert(1) hue-rotate(180deg) grayscale(0.35) brightness(0.78) contrast(1.15)',
    rota: '#4fe3c3',
    contorno: '#04211d',
  },
  /* O OSM como ele é: nomes de rua legíveis, comércio, pontos de referência. */
  detalhado: {
    id: 'detalhado',
    nome: 'Detalhado',
    filtro: 'none',
    rota: '#0f766e',
    contorno: '#ffffff',
  },
}

export const BASEMAP_LIST: readonly Basemap[] = [
  BASEMAPS.suave,
  BASEMAPS.noturno,
  BASEMAPS.detalhado,
]

/**
 * Sem escolha explícita, o mapa acompanha o tema do aplicativo: quem já pediu
 * a interface escura não quer um retângulo branco no meio dela.
 */
export function resolveBasemap(preferencia: string | null | undefined, dark: boolean): Basemap {
  if (preferencia && preferencia in BASEMAPS) return BASEMAPS[preferencia as BasemapId]
  return dark ? BASEMAPS.noturno : BASEMAPS.suave
}

export const MAP_STYLE_STORAGE_KEY = 'synse-map-style'
