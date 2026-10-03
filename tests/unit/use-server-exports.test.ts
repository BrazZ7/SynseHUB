import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Arquivo `'use server'` só pode exportar função async.
 *
 * Exportar uma constante de lá derruba a ação em produção com "A 'use server'
 * file can only export async functions, found object" — e nada avisa antes: o
 * typecheck passa, o lint passa, o build passa, e a tela quebra na primeira
 * vez que alguém clica.
 *
 * Foi o que aconteceu com `initialChallengeState`. O projeto já resolvia isso
 * com um `state.ts` ao lado; a convenção existia e foi ignorada. Este teste é
 * o que faz a convenção se defender sozinha.
 */
function arquivosDeAcao(dir: string, encontrados: string[] = []): string[] {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name)

    if (entrada.isDirectory()) {
      arquivosDeAcao(caminho, encontrados)
      continue
    }

    if (!entrada.name.endsWith('.ts') && !entrada.name.endsWith('.tsx')) continue

    const conteudo = readFileSync(caminho, 'utf8')
    if (/^\s*['"]use server['"]/.test(conteudo)) encontrados.push(caminho)
  }

  return encontrados
}

const arquivos = arquivosDeAcao('src')

describe("arquivos 'use server'", () => {
  it('existem, senão este teste não está olhando para nada', () => {
    expect(arquivos.length).toBeGreaterThan(5)
  })

  it.each(arquivos)('%s exporta apenas funções async', (caminho) => {
    const conteudo = readFileSync(caminho, 'utf8')

    /*
     * `export type` e `export interface` somem na compilação e não chegam ao
     * runtime — só valor exportado importa aqui.
     */
    const exportacoes = [...conteudo.matchAll(/^export\s+(?!type\b|interface\b)(\w+)/gm)].map(
      (achado) => achado[1],
    )

    const proibidas = exportacoes.filter((palavra) => palavra !== 'async')

    expect(
      proibidas,
      `${caminho} exporta ${proibidas.join(', ')} — mova para um state.ts ao lado`,
    ).toEqual([])
  })
})
