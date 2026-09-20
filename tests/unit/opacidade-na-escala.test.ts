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
 */

const UTILITARIAS =
  'bg|text|border|ring|from|via|to|fill|stroke|divide|outline|decoration|accent|caret|placeholder'

/** `bg-white/12` → captura o `12`. A forma arbitrária `/[0.12]` não casa. */
const COM_OPACIDADE = new RegExp(`\\b(?:${UTILITARIAS})-[a-z0-9-]+/(\\d{1,3})\\b`, 'g')

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
