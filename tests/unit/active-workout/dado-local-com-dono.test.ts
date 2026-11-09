import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * A identidade do dado local vem do servidor.
 *
 * Os tipos já obrigam a passar um dono para ler e gravar o treino do aparelho —
 * `lerSessao('')` não compila sem argumento. O que os tipos **não** dizem é de
 * onde esse dono vem, e é aí que o defeito voltaria: `string` aceita um id
 * guardado no `localStorage`, um parâmetro de URL ou um valor fixo, e qualquer
 * um dos três reabre o vazamento com o compilador satisfeito.
 *
 * Então a regra fica escrita aqui: quem monta as telas do treino passa a
 * matrícula da sessão autenticada, resolvida no servidor. Identidade escolhida
 * pelo navegador não é identidade.
 */

const RAIZ = join(process.cwd(), 'src')

const ler = (caminho: string) => readFileSync(join(RAIZ, caminho), 'utf8')

const TELAS = [
  {
    arquivo: 'app/(student)/app/workout/active/page.tsx',
    componente: 'ActiveWorkoutScreen',
  },
  {
    arquivo: 'app/(student)/app/workout/page.tsx',
    componente: 'PendingWorkoutSync',
  },
]

describe('o dono do dado local', () => {
  it.each(TELAS)('$componente recebe a matrícula da sessão do servidor', ({ arquivo, componente }) => {
    const fonte = ler(arquivo)

    // Controle: se o componente for renomeado ou a tela mudar de lugar, o teste
    // falha em vez de passar sem conferir nada.
    expect(fonte).toContain(`<${componente}`)
    expect(fonte).toContain('requireStudentSession')
    expect(fonte).toMatch(/dono=\{session\.studentId\}/)
  })

  it('a loja de sessão nunca é aberta sem a chave do dono', () => {
    /*
     * Antes, a sessão era gravada e lida em `'atual'` — uma chave só, igual
     * para todo mundo. Cada acesso à loja precisa passar por
     * `chaveDaSessao(dono)`; um acesso a mais que o número de chaves é um
     * acesso sem escopo.
     */
    const fonte = ler('features/active-workout/storage/local-workout.ts')

    const acessos = fonte.match(/LOJA_SESSAO,/g) ?? []
    const comChave = fonte.match(/chaveDaSessao\(dono\)/g) ?? []

    expect(acessos.length).toBeGreaterThanOrEqual(3)
    expect(comChave).toHaveLength(acessos.length)
  })

  it('a leitura da fila confere o dono', () => {
    const fonte = ler('features/active-workout/storage/local-workout.ts')
    expect(fonte).toMatch(/export async function lerFila\(dono: string\)/)
    expect(fonte).toContain('filaDoDono(guardadas, dono)')
  })

  it('a atualização do banco local descarta o que ficou sem dono', () => {
    /*
     * O registro da versão 1 não diz de quem é. Adotá-lo para quem abrir o app
     * primeiro repetiria o vazamento uma última vez — num aparelho
     * compartilhado, as séries de uma pessoa no histórico de outra. A limpeza
     * mora no `onupgradeneeded`, que roda antes de qualquer leitura.
     */
    const fonte = ler('features/active-workout/storage/local-workout.ts')
    expect(fonte).toMatch(/evento\.oldVersion < 2/)
    expect(fonte).toMatch(/objectStore\(LOJA_SESSAO\)\.clear\(\)/)
    expect(fonte).toMatch(/objectStore\(LOJA_FILA\)\.clear\(\)/)
  })
})
