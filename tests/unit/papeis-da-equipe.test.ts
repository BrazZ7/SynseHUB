import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Todo papel do banco tem rótulo na tela de compartilhamento.
 *
 * A primeira versão de `PAPEIS` trazia um `ADMIN` que não existe no enum e
 * **não** trazia `MANAGER`, que existe — e a tela mostrou "MANAGER" cru ao
 * lado do nome de uma pessoa. Encontrado olhando a tela.
 *
 * O teste lê o enum da 0001 em vez de repetir a lista: uma segunda cópia aqui
 * divergiria na primeira vez que o banco ganhasse um papel, que é exatamente
 * o caso que isto existe para pegar.
 */
function papeisDoBanco(): string[] {
  const sql = readFileSync(join(process.cwd(), 'src/db/migrations/0001_core.sql'), 'utf8')
  const bloco = sql.match(/create type user_role as enum \(([\s\S]*?)\)/)
  if (!bloco) throw new Error('enum user_role não encontrado na 0001')
  return [...bloco[1].matchAll(/'([A-Z_]+)'/g)].map((m) => m[1])
}

function papeisDaTela(): string[] {
  const tsx = readFileSync(
    join(process.cwd(), 'src/features/synse-body/compartilhamento.tsx'),
    'utf8',
  )
  const bloco = tsx.match(/const PAPEIS: Record<string, string> = \{([\s\S]*?)\n\}/)
  if (!bloco) throw new Error('PAPEIS não encontrado')
  return [...bloco[1].matchAll(/^\s{2}([A-Z_]+):/gm)].map((m) => m[1])
}

describe('os papéis da equipe', () => {
  it('o enum do banco tem oito, e a leitura funciona', () => {
    // O controle: sem isto, uma expressão que lesse zero papéis faria a
    // asserção de baixo passar comparando duas listas vazias.
    expect(papeisDoBanco()).toContain('MANAGER')
    expect(papeisDoBanco().length).toBeGreaterThanOrEqual(8)
    expect(papeisDaTela().length).toBeGreaterThanOrEqual(8)
  })

  it('todo papel do banco tem rótulo na tela', () => {
    expect([...papeisDaTela()].sort()).toEqual([...papeisDoBanco()].sort())
  })
})
