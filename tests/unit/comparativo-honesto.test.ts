import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import fg from 'fast-glob'
import { describe, expect, it } from 'vitest'

import { TIER_COMPARISON } from '@/lib/plans/tiers'

/**
 * ── A tabela não pode prometer o que o código não faz ───────────────────────
 *
 * O comparativo da tela do Synse+ anunciava "programas guiados de 21, 30, 60 e
 * 90 dias" e "receitas Synse". As tabelas que sustentariam os dois —
 * `programs`, `program_steps`, `program_enrollments`, `recipes` — existem no
 * banco desde a 0003 e **não têm uma leitura sequer** no aplicativo.
 *
 * Enquanto ninguém pagava, era exagero de folheto. No dia em que o Mercado
 * Pago entrou, virou a descrição do que a pessoa compra — e a distância entre
 * as duas coisas tem nome.
 *
 * ── Por que amarrar ao código, e não só corrigir o texto ────────────────────
 *
 * Porque texto corrigido volta. Alguém relê a tabela daqui a três meses, acha
 * que está pobre, e reescreve a promessa — sem saber que a funcionalidade
 * nunca existiu. Um teste que confere o texto contra o código não deixa, e
 * **se solta sozinho** no dia em que a funcionalidade chegar: assim que
 * `programs` for lida em algum lugar, a linha volta a poder ser anunciada.
 */

/** O que cada promessa exige que exista de verdade. */
const PROMESSAS = [
  {
    assunto: 'programas guiados',
    termos: /programas? guiad/i,
    tabelas: ['programs', 'program_steps'],
  },
  { assunto: 'receitas Synse', termos: /receitas?\s+synse/i, tabelas: ['recipes'] },
]

/**
 * Tira comentários antes de contar.
 *
 * A primeira versão deste teste passou com a promessa falsa de volta, e o
 * motivo foi este: os comentários que eu mesmo escrevi explicando o problema
 * citam `programs` e `recipes` entre crases. O contador leu as próprias
 * explicações como prova de que a funcionalidade existe — um guarda que se
 * anula sozinho, e que só apareceu porque a mutação foi rodada.
 *
 * Linha que começa com `//` ou `*` sai inteira; bloco `/* … *\/` sai todo.
 * Não toca em `//` no meio da linha, para não comer uma URL dentro de string
 * — e errar para menos aqui deixa o teste mais rígido, nunca mais frouxo.
 */
function semComentarios(codigo: string): string {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .filter((linha) => !/^\s*(\/\/|\*)/.test(linha))
    .join('\n')
}

/** Quantas vezes o aplicativo lê esta tabela? */
function usosNoApp(tabela: string): number {
  const arquivos = fg.sync(['src/**/*.{ts,tsx}'], { cwd: process.cwd(), absolute: false })
  let total = 0

  for (const arquivo of arquivos) {
    // As migrations não contam: o que importa é o app ler.
    if (arquivo.startsWith('src/db/')) continue
    const codigo = semComentarios(readFileSync(join(process.cwd(), arquivo), 'utf8'))
    total += [...codigo.matchAll(new RegExp(`['"\`]${tabela}['"\`]`, 'g'))].length
  }

  return total
}

describe('o comparativo de planos', () => {
  it.each(PROMESSAS)('não promete $assunto enquanto nada o lê', ({ termos, tabelas }) => {
    const construido = tabelas.some((t) => usosNoApp(t) > 0)
    if (construido) return // Existe: pode ser anunciado à vontade.

    const prometendo = TIER_COMPARISON.filter(
      (f) => termos.test(f.pro) || (typeof f.free === 'string' && termos.test(f.free)),
    ).map((f) => f.title)

    expect(prometendo, `a tabela anuncia algo que nenhuma tela lê: ${tabelas.join(', ')}`).toEqual(
      [],
    )
  })

  it('e o que ele promete ao assinante corresponde a um limite real no código', () => {
    /*
     * O controle do teste acima. Sem ele, "a tabela não promete nada" passaria
     * — e uma tabela vazia não é honestidade, é omissão.
     *
     * Os cinco diferenciais que existem hoje: biblioteca (`content_library`
     * com `SYNSE_PLUS`), desafios (`CHALLENGES_PER_CYCLE`), análise comparada,
     * histórico (`HISTORY_MONTHS`) e ranking entre amigos.
     */
    const diferentes = TIER_COMPARISON.filter((f) => f.free !== f.pro)
    expect(diferentes.length).toBeGreaterThanOrEqual(5)
  })
})
