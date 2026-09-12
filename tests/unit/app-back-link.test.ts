import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Toda tela do Synse App que não é destino da barra inferior precisa de um
 * jeito de voltar.
 *
 * Sem isso, a tela é um beco sem saída: a barra de baixo leva a outros lugares,
 * mas não de volta a de onde a pessoa veio, e sobra a seta do navegador — que
 * num app instalado na tela inicial simplesmente não existe.
 *
 * A lista de destinos vem da própria barra, e não de uma cópia aqui: raiz nova
 * na barra deixa de exigir o botão automaticamente, e tela nova fora dela
 * passa a exigir.
 */
const RAIZES = (() => {
  const barra = readFileSync('src/components/synse/app-bottom-navigation.tsx', 'utf8')
  return new Set([...barra.matchAll(/href:\s*'([^']+)'/g)].map((achado) => achado[1]))
})()

function telas(dir: string, encontradas: string[] = []): string[] {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name)
    if (entrada.isDirectory()) telas(caminho, encontradas)
    else if (entrada.name === 'page.tsx') encontradas.push(caminho)
  }
  return encontradas
}

/** 'src/app/(student)/app/challenges/page.tsx' → '/app/challenges' */
function rota(caminho: string): string {
  return caminho
    .replace('src/app/(student)', '')
    .replace('/page.tsx', '')
    .replace(/\/\([^)]+\)/g, '')
}

const encontradas = telas('src/app/(student)')

describe('Synse App', () => {
  it('a barra inferior tem destinos, senão este teste não olha para nada', () => {
    expect(RAIZES.size).toBeGreaterThan(3)
    expect(encontradas.length).toBeGreaterThan(RAIZES.size)
  })

  it.each(encontradas)('%s permite voltar sem usar o navegador', (caminho) => {
    if (RAIZES.has(rota(caminho))) return

    /*
     * Procura o uso, não o import: a primeira versão deste teste aceitava o
     * `import` sozinho, e passou com o componente removido da tela. Teste que
     * não falha quando deveria é pior que teste nenhum — dá confiança falsa.
     */
    expect(
      readFileSync(caminho, 'utf8'),
      `${rota(caminho)} não está na barra inferior e não renderiza <AppBackLink>`,
    ).toMatch(/<AppBackLink\b/)
  })
})
