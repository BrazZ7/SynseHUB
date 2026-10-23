import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import fg from 'fast-glob'
import { describe, expect, it } from 'vitest'

/**
 * ── Opacidade só de 5 em 5 ───────────────────────────────────────────────────
 *
 * A escala de opacidade do Tailwind anda de cinco em cinco. `bg-white/15`
 * existe; `bg-white/12` **não gera CSS nenhum** — a classe fica no HTML, o
 * navegador ignora, e o fundo simplesmente não é pintado.
 *
 * Não é hipótese: foram quinze ocorrências em dez arquivos, encontradas ao
 * medir `getComputedStyle` de um botão que parecia ter fundo e devolveu
 * `rgba(0, 0, 0, 0)`. Entre elas os fundos de todos os selos de sucesso, aviso
 * e perigo, os cartões de métrica do painel e o botão de check-in. Ninguém
 * tinha percebido porque o que falta é sutil: um selo sem a tinta de fundo
 * ainda mostra o texto colorido e continua parecendo intencional.
 *
 * Este teste é o alarme. Quem quiser um valor fora da escala escreve
 * `bg-white/[0.12]`, que é a forma arbitrária e gera CSS de verdade.
 *
 * ── A segunda pegada ────────────────────────────────────────────────────────
 *
 * A primeira versão só olhava cores nomeadas, e por isso deixou passar
 * `from-[#02100f]/92` — cor arbitrária entre colchetes com opacidade fora da
 * escala. O efeito foi o mesmo de sempre e igualmente invisível: o primeiro
 * ponto do degradê nunca foi gerado, o véu do cartão de desafio do mês
 * arrancava do transparente, e o texto branco caía em cima da trilha acesa.
 * Foi preciso medir a luminância do fundo pixel a pixel para enxergar — o
 * contraste no pior ponto dava 1,1:1 contra o mínimo de 4,5:1.
 *
 * Por isso a parte da cor aceita as duas formas.
 */

const UTILITARIAS =
  'bg|text|border|ring|from|via|to|fill|stroke|divide|outline|decoration|accent|caret|placeholder'

/**
 * `bg-white/12` e `from-[#02100f]/92` → captura o número.
 *
 * A forma arbitrária da opacidade, `/[0.12]`, não casa de propósito: ela gera
 * CSS e é justamente a saída recomendada para quem precisa de um valor fora
 * da escala.
 */
const COR = '(?:[a-z0-9-]+|\\[[^\\]\\s]+\\])'
const COM_OPACIDADE = new RegExp(`\\b(?:${UTILITARIAS})-${COR}/(\\d{1,3})\\b`, 'g')

describe('modificadores de opacidade', () => {
  it('usam apenas passos que o Tailwind gera', async () => {
    const arquivos = await fg(['src/**/*.{ts,tsx}'], { cwd: process.cwd(), absolute: false })
    expect(arquivos.length).toBeGreaterThan(50)

    const foraDaEscala: string[] = []

    for (const arquivo of arquivos) {
      const conteudo = readFileSync(join(process.cwd(), arquivo), 'utf8')

      for (const achado of conteudo.matchAll(COM_OPACIDADE)) {
        const valor = Number(achado[1])
        if (valor > 100 || valor % 5 === 0) continue
        foraDaEscala.push(`${arquivo}: ${achado[0]}`)
      }
    }

    expect(foraDaEscala).toEqual([])
  })
})
