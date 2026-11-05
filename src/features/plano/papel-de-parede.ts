import type { RoutineBlock } from '@/types/domain'

import { blocosDoDia, diaIso, nomeDoBloco } from '@/features/plano/state'

/**
 * ── O plano como papel de parede ────────────────────────────────────────────
 *
 * O pedido era que o plano substituísse o fundo da tela bloqueada. **Nenhum
 * app pode fazer isso no iOS** — não existe API, e não é questão de esforço:
 * a Apple nunca expôs o papel de parede a terceiros. No Android existe
 * (`WallpaperManager` com `FLAG_LOCK`), mas exige código nativo e uma versão
 * nova na loja.
 *
 * O que funciona nos dois, hoje: **gerar a imagem** e deixar a pessoa salvá-la
 * em dois toques. É o que esta função faz.
 *
 * ── Por que o conteúdo começa na metade de baixo ────────────────────────────
 *
 * A tela bloqueada do iOS tem relógio e data ocupando o terço de cima, e a do
 * Android tem relógio e notificações. Texto ali é texto coberto. O plano começa
 * em 44% da altura e termina antes da faixa de desbloqueio, embaixo.
 *
 * ── 1080×1920, e não a resolução do aparelho ────────────────────────────────
 *
 * É a proporção 9:16 que cobre quase todo celular em uso. Mais que isso vira
 * arquivo grande para ganhar pixel que a tela bloqueada não mostra, e o
 * recorte que o sistema faz ao aplicar o papel de parede corta das bordas —
 * por isso nada importante encosta nelas.
 */

export const LARGURA = 1080
export const ALTURA = 1920

/** A margem segura: o sistema corta das bordas ao aplicar o papel de parede. */
const MARGEM = 110

/** Onde a assinatura fica, contando do pé da imagem. */
const ASSINATURA_Y = ALTURA - 150

/** A altura de uma linha da lista. */
const LINHA = 76

type Opcoes = {
  meta: string | null
  blocos: readonly RoutineBlock[]
  agora?: Date
}

/**
 * Quebra o texto em linhas que cabem na largura, medindo de verdade.
 *
 * Contar caracteres não serve: "lllll" e "WWWWW" têm o mesmo comprimento e
 * larguras muito diferentes, e a meta é texto livre de quem escreveu.
 */
function quebrar(ctx: CanvasRenderingContext2D, texto: string, largura: number): string[] {
  const palavras = texto.trim().split(/\s+/).filter(Boolean)
  if (palavras.length === 0) return []

  const linhas: string[] = []
  let atual = palavras[0]

  for (const palavra of palavras.slice(1)) {
    const tentativa = `${atual} ${palavra}`
    if (ctx.measureText(tentativa).width <= largura) atual = tentativa
    else {
      linhas.push(atual)
      atual = palavra
    }
  }
  linhas.push(atual)
  return linhas
}

/**
 * Desenha o plano do dia e devolve o PNG.
 *
 * Roda no navegador — precisa de `canvas`, então nunca no servidor.
 */
export async function gerarPapelDeParede({ meta, blocos, agora = new Date() }: Opcoes): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = LARGURA
  canvas.height = ALTURA

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Este navegador não desenha a imagem.')

  // ── O fundo ───────────────────────────────────────────────────────────────
  const fundo = ctx.createLinearGradient(0, 0, LARGURA, ALTURA)
  fundo.addColorStop(0, '#041d1b')
  fundo.addColorStop(0.55, '#083d38')
  fundo.addColorStop(1, '#0c4a42')
  ctx.fillStyle = fundo
  ctx.fillRect(0, 0, LARGURA, ALTURA)

  /*
   * Um halo no alto, atrás do relógio do sistema. Ele dá profundidade sem
   * competir com nada: a parte de cima da imagem é justamente a que o relógio
   * cobre, então é o lugar certo para o que é só atmosfera.
   */
  const halo = ctx.createRadialGradient(LARGURA / 2, 420, 0, LARGURA / 2, 420, 620)
  halo.addColorStop(0, 'rgba(23,196,165,0.28)')
  halo.addColorStop(1, 'rgba(23,196,165,0)')
  ctx.fillStyle = halo
  ctx.fillRect(0, 0, LARGURA, 1100)

  /*
   * 40% da altura, e não 44%.
   *
   * O relógio da tela bloqueada do iPhone termina perto de 30% e, com widget,
   * perto de 33%; o do Android fica mais alto ainda. 44% era folga demais: ela
   * custava uma linha da lista sem proteger nada — uma rotina de nove blocos
   * cortava no sexto. Medido na imagem gerada.
   */
  let y = Math.round(ALTURA * 0.4)

  // ── A meta ────────────────────────────────────────────────────────────────
  if (meta) {
    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.font = '600 30px system-ui, sans-serif'
    ctx.letterSpacing = '6px'
    ctx.fillText('MINHA META', MARGEM, y)
    ctx.letterSpacing = '0px'
    y += 70

    ctx.fillStyle = '#ffffff'
    ctx.font = '700 62px system-ui, sans-serif'
    for (const linha of quebrar(ctx, meta, LARGURA - MARGEM * 2).slice(0, 3)) {
      ctx.fillText(linha, MARGEM, y)
      y += 78
    }
    y += 40
  }

  // ── O dia ─────────────────────────────────────────────────────────────────
  const hoje = blocosDoDia(blocos, diaIso(agora))

  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.font = '600 30px system-ui, sans-serif'
  ctx.letterSpacing = '6px'
  ctx.fillText(
    agora.toLocaleDateString('pt-BR', { weekday: 'long' }).toUpperCase(),
    MARGEM,
    y,
  )
  ctx.letterSpacing = '0px'
  y += 66

  /*
   * Quantos blocos cabem: o que passar da assinatura some, e é melhor cortar
   * aqui, com um "+ N", do que desenhar texto por baixo dela.
   *
   * O limite é medido até a assinatura, e não contra uma reserva arredondada.
   * Com 260px de reserva, uma rotina de nove blocos cortava no sexto e deixava
   * uma faixa vazia de dois dedos entre a lista e a assinatura — visto na
   * imagem gerada. A conta agora usa o espaço que existe de verdade, menos uma
   * linha para o "+ N" caber quando houver corte.
   */
  const limite = Math.floor((ASSINATURA_Y - 60 - LINHA - y) / LINHA)
  const mostrados = hoje.slice(0, Math.max(0, limite))

  for (const bloco of mostrados) {
    ctx.fillStyle = '#17c4a5'
    ctx.font = '700 44px system-ui, sans-serif'
    ctx.fillText(bloco.atTime, MARGEM, y)

    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.font = '400 44px system-ui, sans-serif'
    ctx.fillText(nomeDoBloco(bloco), MARGEM + 190, y)
    y += LINHA
  }

  if (hoje.length > mostrados.length) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = '400 36px system-ui, sans-serif'
    ctx.fillText(`+ ${hoje.length - mostrados.length} depois`, MARGEM, y)
  }

  if (hoje.length === 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.font = '400 44px system-ui, sans-serif'
    ctx.fillText('Dia livre.', MARGEM, y)
  }

  // ── A assinatura ──────────────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.font = '600 32px system-ui, sans-serif'
  ctx.letterSpacing = '4px'
  ctx.fillText('SYNSE', MARGEM, ASSINATURA_Y)
  ctx.letterSpacing = '0px'

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Não deu para gerar a imagem.'))),
      'image/png',
    )
  })
}

/**
 * Entrega a imagem do jeito que o aparelho sabe receber.
 *
 * ── Compartilhar antes de baixar, e isso importa no iOS ─────────────────────
 *
 * No iPhone, "baixar" um PNG o joga em Arquivos, de onde ele **não** serve de
 * papel de parede sem passar por Fotos. O menu de compartilhamento tem "Salvar
 * em Fotos", que é exatamente o caminho que falta. Por isso ele vem primeiro.
 *
 * Onde o compartilhamento de arquivo não existe — desktop, navegador antigo —,
 * o download resolve.
 *
 * Devolve como entregou, para a tela dizer o próximo passo certo.
 */
export async function entregarImagem(
  blob: Blob,
  nome = 'meu-plano-synse.png',
): Promise<'compartilhou' | 'baixou'> {
  const arquivo = new File([blob], nome, { type: 'image/png' })

  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [arquivo] })
  ) {
    await navigator.share({ files: [arquivo], title: 'Meu plano' })
    return 'compartilhou'
  }

  const url = URL.createObjectURL(blob)
  const elo = document.createElement('a')
  elo.href = url
  elo.download = nome
  elo.click()
  // Sem isto, o blob fica na memória da aba até ela fechar.
  URL.revokeObjectURL(url)
  return 'baixou'
}
