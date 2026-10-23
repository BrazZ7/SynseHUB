import { execSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import config from '../../../tailwind.config'

/**
 * A arte do cartão "Seu dia", e o que nela quebra sem avisar.
 *
 * Três coisas aqui falham em silêncio — nenhuma derruba build, teste de tela
 * ou lint, e todas só aparecem olhando o aparelho:
 *
 *   1. Uma classe `animate-xpto` com nome errado é CSS inexistente. O
 *      elemento fica parado e nada reclama.
 *   2. O facho por cima do véu de leitura devolve um defeito de contraste que
 *      já foi medido e corrigido.
 *   3. A escala de base fora de sincronia com o primeiro quadro do zoom
 *      descobre a borda da foto no meio do passeio.
 */

const RAIZ = join(__dirname, '..', '..', '..')
const COMPONENTE = readFileSync(
  join(RAIZ, 'src/features/students/components/capa-do-dia.tsx'),
  'utf8',
)

const animacoes = (config.theme?.extend as { animation?: Record<string, string> }).animation ?? {}
const quadros = (config.theme?.extend as { keyframes?: Record<string, unknown> }).keyframes ?? {}

describe('toda classe `animate-*` existe de verdade', () => {
  /** Tailwind e o plugin `tailwindcss-animate` trazem estas de fábrica. */
  const DE_FABRICA = new Set(['none', 'spin', 'ping', 'pulse', 'bounce', 'in', 'out'])

  it('nenhuma aponta para uma animação que não foi registrada', () => {
    /*
     * `animate-xpto` sem `xpto` no `tailwind.config.ts` não gera erro: o
     * Tailwind simplesmente não emite classe nenhuma, e o elemento fica
     * imóvel. Renomear um quadro e esquecer um arquivo é o jeito normal de
     * cair nisso.
     */
    const usadas = new Set(
      execSync('grep -rhoE "animate-[a-z0-9-]+" src/', { cwd: RAIZ, encoding: 'utf8' })
        .split('\n')
        .filter(Boolean)
        .map((classe) => classe.replace(/^animate-/, '')),
    )

    const orfas = [...usadas].filter((nome) => !DE_FABRICA.has(nome) && !(nome in animacoes))
    expect(orfas).toEqual([])
  })

  it('toda animação registrada tem o quadro correspondente', () => {
    const semQuadro = Object.keys(animacoes).filter((nome) => !(nome in quadros))
    expect(semQuadro).toEqual([])
  })
})

describe('a arte do cartão "Seu dia"', () => {
  it('a foto está versionada e é a que o componente declara', () => {
    /*
     * A lição é do `apple-raiz.pem`: arquivo no disco, suíte verde, deploy sem
     * ele. Conferir o `git ls-files` é o que pega.
     */
    const rastreados = execSync('git ls-files public', { cwd: RAIZ, encoding: 'utf8' }).split('\n')
    expect(rastreados).toContain('public/synse-halteres.webp')

    expect(COMPONENTE).toContain('src="/synse-halteres.webp"')

    /*
     * 1280×720 é o que está no `width`/`height` do `next/image`. Divergir não
     * quebra nada visível — o `object-cover` corrige —, mas a reserva de
     * espaço sai errada e o cartão pula quando a foto chega.
     */
    expect(COMPONENTE).toMatch(/width=\{1280\}/)
    expect(COMPONENTE).toMatch(/height=\{720\}/)

    const bytes = statSync(join(RAIZ, 'public/synse-halteres.webp')).size
    expect(bytes).toBeLessThan(120_000)
  })

  it('é decorativa: não entra na leitura de tela', () => {
    expect(COMPONENTE).toMatch(/aria-hidden/)
    expect(COMPONENTE).toMatch(/alt=""/)
  })

  it('o facho vem antes dos véus', () => {
    /*
     * Não é isto que segura o contraste hoje — é o pico do facho estar em 26%
     * do ciclo, longe da coluna de texto. Com o pico no lugar, as duas ordens
     * medem 5,77:1 atrás dos glifos.
     *
     * A ordem é a garantia: embaixo do véu, mexer no tempo outra hora não
     * consegue pôr faixa clara sobre o texto. É um invariante barato de manter
     * e caro de redescobrir, então fica preso aqui.
     */
    const facho = COMPONENTE.indexOf('animate-facho')
    const veuDeLeitura = COMPONENTE.indexOf('bg-gradient-to-r from-synse-dark')
    const veuDoPe = COMPONENTE.indexOf('bg-gradient-to-t from-synse-dark')

    expect(facho).toBeGreaterThan(-1)
    expect(veuDeLeitura).toBeGreaterThan(-1)
    expect(veuDoPe).toBeGreaterThan(-1)
    expect(facho).toBeLessThan(veuDeLeitura)
    expect(facho).toBeLessThan(veuDoPe)
  })

  it('o véu de leitura cobre a coluna de texto, com a classe que gera CSS', () => {
    /*
     * **Os colchetes são o teste.** A escala de posições do Tailwind anda de
     * cinco em cinco, então `via-62%` não gera regra nenhuma: a classe fica no
     * HTML, o degradê usa o meio padrão de 50% e nada acusa. Foi o que
     * aconteceu, e só apareceu lendo `--tw-gradient-via-position` no
     * navegador.
     */
    const classes = [...COMPONENTE.matchAll(/className="([^"]*)"/g)].map((m) => m[1]).join(' ')
    expect(classes).toContain('via-[62%]')
    // Só nas classes: o comentário acima cita a forma errada de propósito.
    expect(classes).not.toMatch(/via-\d+%/)
  })

  it('quem pediu menos movimento não vê nenhum', () => {
    /*
     * O facho **some**, e não só congela: `globals.css` zera a duração, o que
     * para a travessia mas deixa a faixa acesa num lugar qualquer — um
     * lampejo parado no meio do cartão.
     */
    expect(COMPONENTE).toMatch(
      /animate-facho[^"]*motion-reduce:hidden|motion-reduce:hidden[^"]*animate-facho/,
    )

    // A foto apenas para de se mexer; parada ela é um estado válido.
    expect(COMPONENTE).toMatch(/motion-safe:animate-aproximar/)
  })

  it('a escala de base é a mesma do primeiro quadro do zoom', () => {
    /*
     * Se o quadro começar mais fundo que a classe, o passeio sai da foto e
     * descobre a borda do cartão — e quem pediu menos movimento vê uma escala
     * diferente da de todo mundo. Medido no navegador, no extremo do zoom a
     * foto ainda sobra 9,6px na borda mais apertada.
     */
    const naClasse = COMPONENTE.match(/scale-\[([\d.]+)\]/)
    expect(naClasse).not.toBeNull()

    const zoom = quadros.aproximar as { from: { transform: string } }
    const noQuadro = zoom.from.transform.match(/scale\(([\d.]+)\)/)
    expect(noQuadro).not.toBeNull()

    expect(naClasse![1]).toBe(noQuadro![1])
  })
})
