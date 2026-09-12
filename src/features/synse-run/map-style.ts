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

export type BasemapId = 'noturno' | 'suave' | 'detalhado'

export type Basemap = {
  id: BasemapId
  nome: string
  /** Aplicado ao painel de azulejos — nunca à rota, que fica em outro painel. */
  filtro: string
  /** Linha do percurso, escolhida para contrastar com este fundo. */
  rota: string
  espessura: number
  /**
   * Traço mais largo por baixo da linha.
   *
   * É o que separa um mapa com uma linha em cima de um mapa de corrida: o
   * percurso cruza rua, rio e mata, e sem um contorno próprio ele se confunde
   * com a via embaixo. No escuro o contorno é mais claro e vira brilho; no
   * claro é branco e vira recorte.
   */
  halo: { cor: string; espessura: number; opacidade: number }
  /** Contorno do marcador atual: precisa se separar da linha e do fundo. */
  contorno: string
}

const BASEMAPS: Record<BasemapId, Basemap> = {
  /*
   * Ardósia escura, no espírito dos aplicativos de corrida.
   *
   * Os valores não foram escolhidos no olho: renderizei o mesmo trecho com
   * dezenas de combinações e comparei as capturas. `invert` + `grayscale`
   * derruba a cor original do OSM (asfalto amarelo, parque verde, prédio
   * rosa), `sepia` devolve uma cor só, e o giro de matiz leva essa cor do
   * marrom para o azul-ardósia. O resto é achar o ponto em que a rua ainda se
   * lê e o fundo já não compete com o percurso.
   */
  noturno: {
    id: 'noturno',
    nome: 'Ardósia',
    filtro:
      'invert(1) grayscale(1) sepia(0.85) hue-rotate(165deg) saturate(1.35) brightness(0.78) contrast(1.02)',
    rota: '#8ff7e0',
    espessura: 4,
    halo: { cor: '#17c4a5', espessura: 10, opacidade: 0.35 },
    contorno: '#04211d',
  },
  /* Cinza claro, quase sem cor. Para quem corre de dia e quer a tela clara. */
  suave: {
    id: 'suave',
    nome: 'Claro',
    filtro: 'grayscale(0.65) saturate(0.8) brightness(1.06) contrast(0.92)',
    rota: '#00a98f',
    espessura: 5,
    halo: { cor: '#ffffff', espessura: 9, opacidade: 0.85 },
    contorno: '#ffffff',
  },
  /* O OSM como ele é: nomes de rua legíveis, comércio, pontos de referência. */
  detalhado: {
    id: 'detalhado',
    nome: 'Detalhado',
    filtro: 'none',
    rota: '#0f766e',
    espessura: 5,
    halo: { cor: '#ffffff', espessura: 9, opacidade: 0.9 },
    contorno: '#ffffff',
  },
}

export const BASEMAP_LIST: readonly Basemap[] = [
  BASEMAPS.noturno,
  BASEMAPS.suave,
  BASEMAPS.detalhado,
]

/**
 * O padrão é o mapa escuro, nos dois temas do aplicativo.
 *
 * Não é descuido com o tema claro: o mapa é uma superfície de leitura rápida
 * em movimento, e o fundo escuro com a rota acesa é o que se enxerga no sol e
 * de relance. Quem preferir o contrário troca no próprio mapa, e a escolha
 * fica salva.
 */
export function resolveBasemap(preferencia: string | null | undefined): Basemap {
  if (preferencia && preferencia in BASEMAPS) return BASEMAPS[preferencia as BasemapId]
  return BASEMAPS.noturno
}

export const MAP_STYLE_STORAGE_KEY = 'synse-map-style'
