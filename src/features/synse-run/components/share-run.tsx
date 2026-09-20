'use client'

import { Check, Download, Loader2, Share2 } from 'lucide-react'
import { useCallback, useState } from 'react'

import { Button } from '@/components/ui/button'
import { formatDistance, formatDuration, formatPace } from '@/features/synse-run/format'
import { afinarRota, projetarRota, type PontoGeografico } from '@/features/synse-run/share-card'

/**
 * Compartilhar a corrida como imagem.
 *
 * ── Por que existe ──────────────────────────────────────────────────────────
 *
 * Até aqui nada saía do aplicativo: o traçado, o pace e os recordes morriam
 * dentro do aparelho. Esta é a única superfície do produto que traz gente nova
 * sem custo por pessoa — cada corrida postada é a marca circulando de graça.
 *
 * ── Por que no `canvas`, e não no servidor ──────────────────────────────────
 *
 * Gerar no servidor renderiza tipografia igual em todo aparelho, mas custa uma
 * rota nova, um arquivo de fonte no repositório e uma ida à rede no exato
 * momento em que a pessoa quer postar — muitas vezes na rua, com sinal ruim,
 * logo depois de correr. No `canvas` é instantâneo, funciona sem rede e não
 * acrescenta dependência nenhuma. Os dados já estão na tela.
 *
 * ── Sem mapa por baixo, de propósito ────────────────────────────────────────
 *
 * O traçado vai sozinho, sem ruas nem satélite. Um percurso costuma começar na
 * porta de casa, e sobre um mapa isso é o endereço de alguém numa rede social.
 * Sem base geográfica sobra a forma do percurso — que é o que a pessoa
 * reconhece e quer mostrar — sem entregar onde ela mora.
 */

const LARGURA = 1080
const ALTURA = 1920

type Props = {
  titulo: string
  quando: Date
  distanciaMetros: number
  movimentoSegundos: number
  paceMedio: number | null
  rota: readonly PontoGeografico[]
}

export function CompartilharCorrida({
  titulo,
  quando,
  distanciaMetros,
  movimentoSegundos,
  paceMedio,
  rota,
}: Props) {
  const [estado, setEstado] = useState<'parado' | 'gerando' | 'pronto'>('parado')
  const [erro, setErro] = useState<string | null>(null)

  const desenhar = useCallback(async () => {
    const tela = document.createElement('canvas')
    tela.width = LARGURA
    tela.height = ALTURA
    const c = tela.getContext('2d')
    if (!c) throw new Error('canvas indisponível')

    /*
     * Espera a fonte do app carregar. Sem isso o `canvas` desenha com a fonte
     * de sistema, e o cartão sai com a tipografia do celular de cada um em vez
     * da do Synse.
     */
    try {
      await document.fonts.ready
    } catch {
      // Fonte de sistema ainda produz um cartão legível.
    }
    const fonte = (peso: number, tamanho: number) =>
      `${peso} ${tamanho}px Inter, system-ui, sans-serif`

    // ── Fundo: a mesma noite da capa do perfil ──────────────────────────────
    const fundo = c.createLinearGradient(0, 0, LARGURA, ALTURA)
    fundo.addColorStop(0, '#062e2a')
    fundo.addColorStop(0.55, '#04100e')
    fundo.addColorStop(1, '#010b0a')
    c.fillStyle = fundo
    c.fillRect(0, 0, LARGURA, ALTURA)

    const brilho = c.createRadialGradient(
      LARGURA * 0.5,
      ALTURA * 0.42,
      0,
      LARGURA * 0.5,
      ALTURA * 0.42,
      LARGURA * 0.8,
    )
    brilho.addColorStop(0, 'rgba(23,196,165,0.20)')
    brilho.addColorStop(1, 'rgba(23,196,165,0)')
    c.fillStyle = brilho
    c.fillRect(0, 0, LARGURA, ALTURA)

    // ── Topo ────────────────────────────────────────────────────────────────
    c.fillStyle = 'rgba(230,245,241,0.55)'
    c.font = fonte(600, 34)
    c.letterSpacing = '8px'
    c.fillText('SYNSE RUN', 96, 190)
    c.letterSpacing = '0px'

    c.fillStyle = '#e6f5f1'
    c.font = fonte(700, 58)
    c.fillText(titulo.slice(0, 26), 96, 280)

    c.fillStyle = 'rgba(230,245,241,0.5)'
    c.font = fonte(400, 34)
    c.fillText(
      quando.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }),
      96,
      336,
    )

    // ── O traçado ───────────────────────────────────────────────────────────
    const moldura = { largura: LARGURA, altura: 820, margem: 150 }
    const pontos = projetarRota(afinarRota(rota, 400), moldura)
    const deslocamentoY = 430

    if (pontos.length > 1) {
      c.save()
      c.translate(0, deslocamentoY)
      c.lineJoin = 'round'
      c.lineCap = 'round'

      // O halo primeiro, o fio por cima: é o que dá o aceso do traçado.
      c.strokeStyle = 'rgba(23,196,165,0.28)'
      c.lineWidth = 34
      c.filter = 'blur(18px)'
      traçar(c, pontos)
      c.filter = 'none'

      c.strokeStyle = '#4fe3c3'
      c.lineWidth = 11
      traçar(c, pontos)

      // Começo e fim, para o percurso ter direção
      const primeiro = pontos[0]!
      const ultimo = pontos.at(-1)!
      bolinha(c, primeiro.x, primeiro.y, 20, '#e6f5f1')
      bolinha(c, ultimo.x, ultimo.y, 20, '#17c4a5')
      c.restore()
    }

    // ── Os números ──────────────────────────────────────────────────────────
    const baseY = 1480
    c.fillStyle = '#e6f5f1'
    c.font = fonte(700, 190)
    const km = formatDistance(distanciaMetros)
    c.fillText(km, 96, baseY)

    const larguraKm = c.measureText(km).width
    c.fillStyle = 'rgba(230,245,241,0.45)'
    c.font = fonte(600, 54)
    c.fillText('km', 96 + larguraKm + 22, baseY)

    const colunas: Array<[string, string]> = [
      ['TEMPO', formatDuration(movimentoSegundos)],
      ['PACE MÉDIO', `${formatPace(paceMedio)} /km`],
    ]
    colunas.forEach(([rotulo, valor], i) => {
      const x = 96 + i * 470
      c.fillStyle = 'rgba(230,245,241,0.45)'
      c.font = fonte(600, 30)
      c.letterSpacing = '4px'
      c.fillText(rotulo, x, baseY + 96)
      c.letterSpacing = '0px'
      c.fillStyle = '#e6f5f1'
      c.font = fonte(700, 76)
      c.fillText(valor, x, baseY + 180)
    })

    // ── Assinatura ──────────────────────────────────────────────────────────
    c.fillStyle = 'rgba(79,227,195,0.85)'
    c.font = fonte(600, 34)
    c.letterSpacing = '6px'
    c.fillText('SYNSE.COM.BR', 96, ALTURA - 110)
    c.letterSpacing = '0px'

    return new Promise<Blob>((resolve, reject) => {
      tela.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('não foi possível gerar a imagem'))),
        'image/png',
      )
    })
  }, [titulo, quando, distanciaMetros, movimentoSegundos, paceMedio, rota])

  async function compartilhar() {
    setErro(null)
    setEstado('gerando')
    try {
      const blob = await desenhar()
      const arquivo = new File([blob], 'corrida-synse.png', { type: 'image/png' })

      /*
       * `canShare` com o arquivo, e não só `navigator.share`: há navegador que
       * compartilha texto e recusa arquivo, e aí a chamada falha depois de a
       * pessoa já ter tocado no botão. Quando não dá, baixa — que é o caminho
       * que sempre existe.
       */
      if (navigator.canShare?.({ files: [arquivo] })) {
        await navigator.share({ files: [arquivo] })
      } else {
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = arquivo.name
        link.click()
        URL.revokeObjectURL(url)
      }
      setEstado('pronto')
      setTimeout(() => setEstado('parado'), 2200)
    } catch (e) {
      // Cancelar no menu do sistema chega como erro, e não é um.
      if (e instanceof DOMException && e.name === 'AbortError') {
        setEstado('parado')
        return
      }
      setErro('Não foi possível gerar a imagem.')
      setEstado('parado')
    }
  }

  const podeCompartilhar = typeof navigator !== 'undefined' && 'canShare' in navigator

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={compartilhar}
        disabled={estado === 'gerando'}
      >
        {estado === 'gerando' ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : estado === 'pronto' ? (
          <Check className="size-4" aria-hidden />
        ) : podeCompartilhar ? (
          <Share2 className="size-4" aria-hidden />
        ) : (
          <Download className="size-4" aria-hidden />
        )}
        {estado === 'gerando'
          ? 'Gerando…'
          : estado === 'pronto'
            ? 'Pronto'
            : podeCompartilhar
              ? 'Compartilhar corrida'
              : 'Baixar imagem da corrida'}
      </Button>
      {erro && <p className="text-xs text-synse-danger">{erro}</p>}
      <p className="text-center text-[11px] text-synse-muted">
        A imagem leva só o traçado, sem mapa por baixo — o percurso aparece, o endereço não.
      </p>
    </div>
  )
}

function traçar(c: CanvasRenderingContext2D, pontos: readonly { x: number; y: number }[]) {
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
