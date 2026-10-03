/**
 * A base dos cartões de compartilhar.
 *
 * Corrida, medalha e recorde dividem a mesma moldura: o fundo de noite do
 * Synse, a etiqueta em cima, um número grande embaixo, as colunas de apoio e a
 * assinatura. O que muda é o miolo.
 *
 * Isto é código de desenho, não de cálculo — roda só no navegador, onde existe
 * `canvas`. A conta que dá para testar mora em `synse-run/share-card.ts`.
 */

export const LARGURA = 1080
export const ALTURA = 1920

/** Uma tela pronta, com a fonte do app já carregada. */
export async function novaTela() {
  const tela = document.createElement('canvas')
  tela.width = LARGURA
  tela.height = ALTURA
  const c = tela.getContext('2d')
  if (!c) throw new Error('canvas indisponível')

  /*
   * Sem esperar a fonte, o `canvas` desenha com a de sistema e o cartão sai com
   * a tipografia do celular de cada um em vez da do Synse.
   */
  try {
    await document.fonts.ready
  } catch {
    // Fonte de sistema ainda produz um cartão legível.
  }

  return { tela, c }
}

/**
 * A fonte do cartão.
 *
 * Manrope, a mesma do aplicativo — a primeira versão pedia `Inter`, que o
 * projeto não usa em lugar nenhum, então o cartão saía com a fonte de sistema
 * de cada celular achando que estava certo. Agora ela é servida deste domínio,
 * o que também significa que está disponível quando o `canvas` desenha.
 */
export function fonte(peso: number, tamanho: number) {
  return `${peso} ${tamanho}px Manrope, system-ui, sans-serif`
}

/** O fundo: a mesma noite da capa do perfil. */
export function fundoSynse(c: CanvasRenderingContext2D) {
  const noite = c.createLinearGradient(0, 0, LARGURA, ALTURA)
  noite.addColorStop(0, '#062e2a')
  noite.addColorStop(0.55, '#04100e')
  noite.addColorStop(1, '#010b0a')
  c.fillStyle = noite
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
}

export function espacado(
  c: CanvasRenderingContext2D,
  texto: string,
  x: number,
  y: number,
  espaco: string,
) {
  c.letterSpacing = espaco
  c.fillText(texto, x, y)
  c.letterSpacing = '0px'
}

export function cabecalho(
  c: CanvasRenderingContext2D,
  { etiqueta, titulo, subtitulo }: { etiqueta: string; titulo: string; subtitulo: string },
) {
  c.fillStyle = 'rgba(230,245,241,0.55)'
  c.font = fonte(600, 34)
  espacado(c, etiqueta, 96, 190, '8px')

  c.fillStyle = '#e6f5f1'
  c.font = fonte(700, 58)
  c.fillText(titulo.slice(0, 26), 96, 280)

  c.fillStyle = 'rgba(230,245,241,0.5)'
  c.font = fonte(400, 34)
  c.fillText(subtitulo, 96, 336)
}

/** O número que a pessoa quer mostrar, com a unidade colada do lado. */
export function numeroGrande(
  c: CanvasRenderingContext2D,
  { valor, unidade, y }: { valor: string; unidade: string; y: number },
) {
  c.fillStyle = '#e6f5f1'
  c.font = fonte(700, 190)
  c.fillText(valor, 96, y)

  if (!unidade) return
  const largura = c.measureText(valor).width
  c.fillStyle = 'rgba(230,245,241,0.45)'
  c.font = fonte(600, 54)
  c.fillText(unidade, 96 + largura + 22, y)
}

export function colunas(
  c: CanvasRenderingContext2D,
  pares: ReadonlyArray<readonly [string, string]>,
  y: number,
) {
  pares.forEach(([rotulo, valor], i) => {
    const x = 96 + i * 470
    c.fillStyle = 'rgba(230,245,241,0.45)'
    c.font = fonte(600, 30)
    espacado(c, rotulo, x, y, '4px')
    c.fillStyle = '#e6f5f1'
    c.font = fonte(700, 76)
    c.fillText(valor, x, y + 84)
  })
}

export function assinatura(c: CanvasRenderingContext2D) {
  c.fillStyle = 'rgba(79,227,195,0.85)'
  c.font = fonte(600, 34)
  espacado(c, 'SYNSE.COM.BR', 96, ALTURA - 110, '6px')
}

export function paraBlob(tela: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    tela.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('não foi possível gerar a imagem'))),
      'image/png',
    )
  })
}
