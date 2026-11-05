import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Cada casca do produto tem um marco de conteúdo principal.
 *
 * O `<main>` é o que dá a quem usa leitor de tela o salto "ir para o conteúdo".
 * Sem ele, a pessoa atravessa a barra de contexto e o menu em cada página.
 *
 * O app do aluno era a única casca sem ele — justamente a das telas que mais se
 * abrem. O painel, o onboarding e as páginas legais já tinham.
 *
 * Teste de texto porque o que falha aqui é a estrutura do JSX, e renderizar
 * React em teste é algo que este projeto não faz.
 */

const CASCAS = [
  { arquivo: 'src/app/(student)/layout.tsx', nome: 'app do aluno' },
  { arquivo: 'src/app/(hub)/layout.tsx', nome: 'painel da academia' },
  { arquivo: 'src/app/onboarding/page.tsx', nome: 'onboarding' },
]

describe('o marco do conteúdo', () => {
  it.each(CASCAS)('a casca do $nome tem <main>', ({ arquivo }) => {
    const fonte = readFileSync(join(process.cwd(), arquivo), 'utf8')
    expect(fonte).toMatch(/<main[\s>]/)
  })

  /*
   * A contagem vale para as **cascas**, que têm um `return` só.
   *
   * A página de onboarding tem dois `<main>` em ramos exclusivos — a escolha da
   * porta e o formulário — e nunca renderiza os dois. Contar texto não sabe
   * disso, e exigir um só ali seria exigir uma reescrita para satisfazer o
   * teste, não a pessoa que usa leitor de tela.
   */
  it.each(CASCAS.filter((casca) => casca.arquivo.includes('layout')))(
    'e só um, na casca do $nome',
    ({ arquivo }) => {
      /*
       * Dois `main` renderizados juntos são tão ruins quanto nenhum: o leitor
       * de tela anuncia dois conteúdos principais e o salto deixa de
       * significar algo. O comentário que explica a escolha cita a tag, então
       * ele sai da conta.
       */
      const fonte = readFileSync(join(process.cwd(), arquivo), 'utf8')
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
      expect(fonte.match(/<main[\s>]/g) ?? []).toHaveLength(1)
    },
  )
})
