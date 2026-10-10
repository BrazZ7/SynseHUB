import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { CLASSES_DA_PILHA, GRADE_DE_ITENS } from '../../src/components/synse/duas-colunas-classes'

/**
 * As duas colunas do app do aluno.
 *
 * Tudo aqui é CSS, e CSS não tem typecheck: as três regras que a técnica de
 * multi-coluna exige quebram **só no navegador**, numa largura que ninguém
 * abre todo dia. Este arquivo é o que faz cada uma se defender sozinha.
 */

const APP_DO_ALUNO = 'src/app/(student)'

function arquivos(dir: string, achados: string[] = []): string[] {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name)
    if (entrada.isDirectory()) arquivos(caminho, achados)
    else if (caminho.endsWith('.tsx')) achados.push(caminho)
  }
  return achados
}

describe('as classes da pilha', () => {
  it('impede o navegador de partir um cartão entre as colunas', () => {
    // Sem isto, um cartão alto é cortado no pé de uma coluna e continua no
    // alto da outra — metade do gráfico de um lado, metade do outro.
    expect(CLASSES_DA_PILHA).toContain('[&>*]:break-inside-avoid')
  })

  it('espaça por baixo, nunca com space-y', () => {
    /*
     * `space-y-*` põe `margin-top` em todo filho menos o primeiro **do DOM**.
     * O primeiro cartão da segunda coluna não é o primeiro do DOM, então ele
     * manteria a margem e a segunda coluna começaria desalinhada da primeira.
     */
    expect(CLASSES_DA_PILHA).toContain('[&>*]:mb-')
    expect(CLASSES_DA_PILHA).not.toMatch(/\bspace-y-/)
  })

  it('só divide a partir do tablet', () => {
    // No telefone é uma coluna, e a página fica exatamente o que sempre foi.
    expect(CLASSES_DA_PILHA).toContain('md:columns-2')
    expect(CLASSES_DA_PILHA).not.toMatch(/(^|\s)columns-/)
  })

  it('está escrita por extenso, para o Tailwind achar', () => {
    /*
     * O Tailwind varre o código como texto. Classe montada em pedaço some da
     * varredura e o CSS não é gerado — o código parece certo e o layout
     * quebra. Aqui o teste confere o que importa: que as classes de verdade,
     * e não um fragmento, aparecem no arquivo-fonte.
     */
    const fonte = readFileSync('src/components/synse/duas-colunas-classes.ts', 'utf8')
    for (const classe of CLASSES_DA_PILHA.split(' ')) {
      expect(fonte).toContain(classe)
    }
  })
})

describe('a grade de itens do catálogo', () => {
  it('desliga o space-y do celular dentro da grade', () => {
    // Senão a margem do empilhamento soma com o `gap` e as linhas abrem um
    // vão a mais do que as colunas.
    expect(GRADE_DE_ITENS).toContain('md:space-y-0')
    expect(GRADE_DE_ITENS).toContain('md:grid-cols-2')
  })
})

describe('as páginas que usam a pilha', () => {
  const paginas = arquivos(APP_DO_ALUNO).map((caminho) => ({
    caminho,
    fonte: readFileSync(caminho, 'utf8'),
  }))

  it('existem — se o caminho mudar, o resto deste arquivo vira teatro', () => {
    expect(paginas.length).toBeGreaterThan(10)
    expect(paginas.some(({ fonte }) => fonte.includes('<PilhaDoApp'))).toBe(true)
  })

  it('nenhuma passa space-y para a pilha', () => {
    /*
     * O erro natural de quem converte uma página: trocar a `div` pela pilha e
     * deixar o `space-y-5` que estava lá. O resultado é um vão no topo da
     * segunda coluna que ninguém liga à classe que o causou.
     */
    const culpadas = paginas
      .flatMap(({ caminho, fonte }) =>
        [...fonte.matchAll(/<PilhaDoApp\b[^>]*>/g)].map((m) => ({ caminho, tag: m[0] })),
      )
      .filter(({ tag }) => /space-y-/.test(tag))

    expect(culpadas).toEqual([])
  })

  it('o app do aluno não usa sticky, que multi-coluna não suporta', () => {
    /*
     * `position: sticky` não funciona dentro de multi-coluna: o cartão
     * simplesmente não gruda, sem erro nenhum. Hoje o app do aluno não usa —
     * este teste é o aviso para quem for usar, porque o cartão grudado vai ter
     * de sair da pilha.
     */
    const comSticky = paginas
      .filter(({ fonte }) => /className="[^"]*\bsticky\b/.test(fonte))
      .map(({ caminho }) => caminho)

    expect(comSticky).toEqual([])
  })
})
