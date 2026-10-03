import { formatDistance, formatDuration, formatPace } from '@/features/synse-run/format'
import { afinarRota, projetarRota, type PontoGeografico } from '@/features/synse-run/share-card'
import {
  ALTURA,
  LARGURA,
  assinatura,
  cabecalho,
  colunas,
  fonte,
  fundoSynse,
  numeroGrande,
} from '@/features/share/card-base'

/**
 * Os três cartões.
 *
 * Um tipo por coisa que vale mostrar: a corrida, a medalha e o recorde de
 * carga. Todos entram como dado puro — quem chama é componente de servidor e
 * não precisa saber desenhar.
 */
export type Cartao =
  | {
      tipo: 'corrida'
      titulo: string
      quando: Date
      distanciaMetros: number
      movimentoSegundos: number
      paceMedio: number | null
      rota: readonly PontoGeografico[]
    }
  | {
      tipo: 'medalha'
      desafio: string
      nivel: string
      quando: Date
      valor: number
      alvo: number
      unidade: string
    }
  | {
      tipo: 'recorde'
      exercicio: string
      quando: Date
      peso: number
      repeticoes: number
    }

export const NOME_DO_ARQUIVO: Record<Cartao['tipo'], string> = {
  corrida: 'corrida-synse.png',
  medalha: 'medalha-synse.png',
  recorde: 'recorde-synse.png',
}

/**
 * Quanto da meta a pessoa fez.
 *
 * Separado e exportado porque é a única conta destes cartões, e errar aqui
 * publica um número errado com a marca do Synse embaixo. A primeira versão
 * limitava em 100% para desenhar o anel e usava o mesmo valor no texto: quem
 * fez 17 de uma meta de 12 via "100%" — o anel estava certo, o texto roubava
 * da pessoa exatamente o que ela queria mostrar.
 */
export function percentualDaMeta(valor: number, alvo: number): number {
  if (!Number.isFinite(valor) || !Number.isFinite(alvo) || alvo <= 0) return 0
  return Math.max(0, Math.round((valor / alvo) * 100))
}

const data = (d: Date) =>
  d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })

const mes = (d: Date) => d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

export function desenhar(c: CanvasRenderingContext2D, cartao: Cartao) {
  fundoSynse(c)

  if (cartao.tipo === 'corrida') desenharCorrida(c, cartao)
  if (cartao.tipo === 'medalha') desenharMedalha(c, cartao)
  if (cartao.tipo === 'recorde') desenharRecorde(c, cartao)

  assinatura(c)
}

// ── Corrida ──────────────────────────────────────────────────────────────────
function desenharCorrida(
  c: CanvasRenderingContext2D,
  cartao: Extract<Cartao, { tipo: 'corrida' }>,
) {
  cabecalho(c, {
    etiqueta: 'SYNSE RUN',
    titulo: cartao.titulo,
    subtitulo: data(cartao.quando),
  })

  const pontos = projetarRota(afinarRota(cartao.rota, 400), {
    largura: LARGURA,
    altura: 820,
    margem: 150,
  })

  if (pontos.length > 1) {
    c.save()
    c.translate(0, 430)
    c.lineJoin = 'round'
    c.lineCap = 'round'

    // O halo primeiro, o fio por cima: é o que dá o aceso do traçado.
    c.strokeStyle = 'rgba(23,196,165,0.28)'
    c.lineWidth = 34
    c.filter = 'blur(18px)'
    tracar(c, pontos)
    c.filter = 'none'

    c.strokeStyle = '#4fe3c3'
    c.lineWidth = 11
    tracar(c, pontos)

    bolinha(c, pontos[0]!.x, pontos[0]!.y, 20, '#e6f5f1')
    bolinha(c, pontos.at(-1)!.x, pontos.at(-1)!.y, 20, '#17c4a5')
    c.restore()
  }

  numeroGrande(c, { valor: formatDistance(cartao.distanciaMetros), unidade: 'km', y: 1480 })
  colunas(
    c,
    [
      ['TEMPO', formatDuration(cartao.movimentoSegundos)],
      ['PACE MÉDIO', `${formatPace(cartao.paceMedio)} /km`],
    ],
    1576,
  )
}

// ── Medalha ──────────────────────────────────────────────────────────────────
/**
 * A medalha desenhada como anel de progresso.
 *
 * O anel mostra o que ela significa: quanto do alvo do desafio a pessoa fez.
 * Uma medalha de participação com 60% da meta é uma história diferente de uma
 * de ouro com 140%, e o cartão conta as duas sem precisar de legenda.
 */
function desenharMedalha(
  c: CanvasRenderingContext2D,
  cartao: Extract<Cartao, { tipo: 'medalha' }>,
) {
  cabecalho(c, {
    etiqueta: `MEDALHA DE ${cartao.nivel.toUpperCase()}`,
    titulo: cartao.desafio,
    subtitulo: mes(cartao.quando),
  })

  const cx = LARGURA / 2
  const cy = 830
  const raio = 280
  const percentual = percentualDaMeta(cartao.valor, cartao.alvo)
  // O anel para na volta completa; o número passa dela, que é a graça.
  const fracao = Math.min(1, percentual / 100)

  c.lineCap = 'round'
  c.strokeStyle = 'rgba(230,245,241,0.12)'
  c.lineWidth = 34
  c.beginPath()
  c.arc(cx, cy, raio, 0, Math.PI * 2)
  c.stroke()

  if (fracao > 0) {
    c.strokeStyle = 'rgba(23,196,165,0.3)'
    c.lineWidth = 60
    c.filter = 'blur(26px)'
    arco(c, cx, cy, raio, fracao)
    c.filter = 'none'

    c.strokeStyle = '#4fe3c3'
    c.lineWidth = 34
    arco(c, cx, cy, raio, fracao)
  }

  c.textAlign = 'center'
  c.fillStyle = '#e6f5f1'
  c.font = fonte(700, 150)
  c.fillText(`${percentual}%`, cx, cy + 40)
  c.fillStyle = 'rgba(230,245,241,0.5)'
  c.font = fonte(500, 40)
  c.fillText('da meta do mês', cx, cy + 110)
  c.textAlign = 'left'

  const enxuto = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','))
  numeroGrande(c, { valor: enxuto(cartao.valor), unidade: cartao.unidade, y: 1480 })
  colunas(c, [['META DO MÊS', `${enxuto(cartao.alvo)} ${cartao.unidade}`]], 1576)
}

// ── Recorde ──────────────────────────────────────────────────────────────────
function desenharRecorde(
  c: CanvasRenderingContext2D,
  cartao: Extract<Cartao, { tipo: 'recorde' }>,
) {
  cabecalho(c, {
    etiqueta: 'RECORDE PESSOAL',
    titulo: cartao.exercicio,
    subtitulo: data(cartao.quando),
  })

  /*
   * As barras: uma leitura do peso sem precisar ler o número, e o desenho que
   * qualquer pessoa reconhece de dentro de uma academia.
   */
  const cx = LARGURA / 2
  const cy = 840
  c.save()
  c.translate(cx, cy)
  c.strokeStyle = 'rgba(23,196,165,0.25)'
  c.lineWidth = 46
  c.filter = 'blur(24px)'
  barra(c)
  c.filter = 'none'
  c.strokeStyle = '#4fe3c3'
  c.fillStyle = '#4fe3c3'
  c.lineWidth = 18
  barra(c)
  c.restore()

  numeroGrande(c, { valor: String(cartao.peso).replace('.', ','), unidade: 'kg', y: 1480 })
  colunas(c, [['REPETIÇÕES', String(cartao.repeticoes)]], 1576)
}

function barra(c: CanvasRenderingContext2D) {
  c.lineCap = 'round'
  // A barra
  c.beginPath()
  c.moveTo(-330, 0)
  c.lineTo(330, 0)
  c.stroke()
  // As anilhas, duas de cada lado
  for (const [x, altura] of [
    [-250, 150],
    [-190, 110],
    [250, 150],
    [190, 110],
  ] as const) {
    c.beginPath()
    c.moveTo(x, -altura)
    c.lineTo(x, altura)
    c.stroke()
  }
}

function arco(c: CanvasRenderingContext2D, cx: number, cy: number, r: number, fracao: number) {
  c.beginPath()
  c.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fracao)
  c.stroke()
}

function tracar(c: CanvasRenderingContext2D, pontos: readonly { x: number; y: number }[]) {
  c.beginPath()
  c.moveTo(pontos[0]!.x, pontos[0]!.y)
  for (const p of pontos.slice(1)) c.lineTo(p.x, p.y)
  c.stroke()
}

function bolinha(c: CanvasRenderingContext2D, x: number, y: number, r: number, cor: string) {
  c.beginPath()
  c.arc(x, y, r, 0, Math.PI * 2)
  c.fillStyle = cor
  c.fill()
}

export { ALTURA, LARGURA }
