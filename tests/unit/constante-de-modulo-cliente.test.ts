import { readFileSync } from 'node:fs'
import { dirname, join, normalize } from 'node:path'

import fg from 'fast-glob'
import { describe, expect, it } from 'vitest'

import { RAIZ, semComentarios } from './grafo-de-importacoes'

/**
 * ── Constante vinda de arquivo `'use client'` ───────────────────────────────
 *
 * Este guarda nasceu de um defeito que compilou, passou em 1507 testes, e
 * estava errado na tela.
 *
 * A ficha do lead lia `PROXIMA[lead.stage]` para decidir o botão "Mover para
 * Contatado". `PROXIMA` morava em `lead-actions.tsx`, que é `'use client'`, e
 * **o que um componente de servidor importa de um módulo cliente vira
 * referência, não valor**. A leitura devolvia `undefined` para toda etapa, o
 * botão não aparecia, e não havia erro no console nem no log: a página
 * renderizava inteira, só que sem a ação principal.
 *
 * Nenhum teste de unidade pega — a constante está certa, o componente está
 * certo. Só aparece clicando. Encontrado no navegador, em 2026-10-03.
 *
 * ── A regra ─────────────────────────────────────────────────────────────────
 *
 * De um módulo `'use client'`, um arquivo de servidor só importa **componente**
 * (PascalCase) e **tipo** (`import type`, que o TypeScript apaga). Constante,
 * objeto e função utilitária moram em módulo sem diretiva — em `state.ts`, que
 * é a convenção que o projeto já usa pela mesma razão do lado `'use server'`.
 *
 * A lista está vazia, e é para continuar: não existe dívida conhecida aqui.
 */

const arquivos = fg.sync(['src/**/*.{ts,tsx}'], { cwd: RAIZ })

function carregar(extras: Record<string, string>): Map<string, string> {
  const mapa = new Map(arquivos.map((a) => [a, readFileSync(join(RAIZ, a), 'utf8')]))
  for (const [caminho, conteudo] of Object.entries(extras)) mapa.set(caminho, conteudo)
  return mapa
}

const ehCliente = (codigo: string) => /^\s*['"]use client['"]/.test(codigo)

/** Resolve o especificador para um arquivo conhecido, como o bundler faria. */
function resolver(
  arquivo: string,
  especificador: string,
  conhecidos: Map<string, string>,
): string | null {
  let base: string
  if (especificador.startsWith('@/')) base = `src/${especificador.slice(2)}`
  else if (especificador.startsWith('.')) base = normalize(join(dirname(arquivo), especificador))
  else return null

  for (const sufixo of ['.ts', '.tsx', '/index.ts', '/index.tsx', '']) {
    if (conhecidos.has(base + sufixo)) return base + sufixo
  }
  return null
}

function valoresImportadosDeCliente(extras: Record<string, string> = {}): string[] {
  const conhecidos = carregar(extras)
  const achados: string[] = []

  for (const [arquivo, bruto] of conhecidos) {
    if (ehCliente(bruto)) continue // módulo cliente importando de outro: tudo bem
    const codigo = semComentarios(bruto)

    for (const imp of codigo.matchAll(
      /import\s+(type\s+)?\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]/g,
    )) {
      if (imp[1]) continue // `import type { ... }`: apagado na compilação

      const alvo = resolver(arquivo, imp[3], conhecidos)
      if (!alvo || !ehCliente(conhecidos.get(alvo) ?? '')) continue

      for (const bruta of imp[2].split(',')) {
        const nome = bruta
          .trim()
          .split(/\s+as\s+/)[0]
          .trim()
        if (!nome || nome.startsWith('type ')) continue
        /*
         * Componente ou constante? `Avancar` tem minúscula no segundo
         * caractere; `PROXIMA` não. A primeira versão deste guarda testava só
         * `/^[A-Z]/` e deixava passar justamente o caso que o motivou — a
         * própria isca não era detectada, e eu só descobri porque a isca
         * existe. Controle que não falha quando deveria é controle inútil.
         */
        if (/^[A-Z][a-z]/.test(nome)) continue
        achados.push(`${arquivo} → ${nome} (de ${alvo})`)
      }
    }
  }

  return [...new Set(achados)].sort()
}

describe('arquivo de servidor não importa valor de módulo cliente', () => {
  it('nenhuma constante atravessando a fronteira', () => {
    /*
     * Falhou? Mova a constante para um módulo sem diretiva — o `state.ts` do
     * próprio recurso — e importe de lá nos dois lados. Não acrescente o nome
     * a uma lista: aqui não há dívida conhecida, e o defeito é invisível.
     */
    expect(valoresImportadosDeCliente()).toEqual([])
  })

  it('e o detector enxerga uma quando existe', () => {
    /*
     * A isca, em memória. Sem ela, `toEqual([])` passaria igual se a
     * resolução de caminho parasse de funcionar — e o guarda seria um teste
     * que não testa.
     */
    const comIsca = valoresImportadosDeCliente({
      'src/features/isca/forms.tsx': "'use client'\nexport const TABELA = { a: 1 }\n",
      'src/app/isca/page.tsx':
        "import { TABELA } from '@/features/isca/forms'\n" +
        'export default function Pagina() {\n  return TABELA.a\n}\n',
    })

    expect(comIsca).toContain('src/app/isca/page.tsx → TABELA (de src/features/isca/forms.tsx)')
  })

  it('e não acusa componente nem tipo, que atravessam de direito', () => {
    const limpo = valoresImportadosDeCliente({
      'src/features/isca/forms.tsx':
        "'use client'\nexport function Formulario() {\n  return null\n}\nexport type Campo = string\n",
      'src/app/isca/page.tsx':
        "import { Formulario } from '@/features/isca/forms'\n" +
        "import type { Campo } from '@/features/isca/forms'\n" +
        'export default function Pagina() {\n  return Formulario\n}\n',
    })

    expect(limpo.filter((a) => a.includes('isca'))).toEqual([])
  })
})
