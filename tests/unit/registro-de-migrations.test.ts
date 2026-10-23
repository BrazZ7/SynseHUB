import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * ── O registro de migrations não pode ficar para trás ────────────────────────
 *
 * `docs/pre-producao.md` guarda, para cada migration, o que ela resolve e por
 * que existe. Não é enfeite: é onde ficam os defeitos que já custaram caro —
 * a 0036 que protegia uma função morta e liberava Synse+ vitalício, a colagem
 * que o SQL Editor corta em silêncio, a 0025 que existe só para consertar os
 * bancos que receberam a primeira versão da 0024.
 *
 * `tests/unit/migrations-esperadas.test.ts` já cobra a lista da sonda. Este
 * cobra a prosa, e por um motivo concreto: a 0036 e a 0037 subiram em
 * produção sem entrar no registro, e ninguém percebeu — o código estava certo,
 * os testes verdes, e o único prejudicado era quem fosse ler o arquivo daqui a
 * seis meses para entender por que `friendships` não olha organização.
 *
 * ── Por que começa na 0017 ──────────────────────────────────────────────────
 *
 * O registro nasceu ali. As anteriores são o esquema-base, e exigi-las agora
 * seria inventar retroativamente uma regra que ninguém seguiu — o teste
 * respeita o mesmo corte que o arquivo já pratica.
 */

const PASTA = join(process.cwd(), 'src/db/migrations')
const DOC = join(process.cwd(), 'docs/pre-producao.md')

/** De onde o registro começa. Ver o comentário acima. */
const PRIMEIRA_REGISTRADA = '0017'

function migrationsNoDisco(): string[] {
  return readdirSync(PASTA)
    .filter((arquivo) => arquivo.endsWith('.sql'))
    .filter((arquivo) => arquivo.slice(0, 4) >= PRIMEIRA_REGISTRADA)
    .map((arquivo) => arquivo.slice(0, 4))
    .sort()
}

/** As entradas do registro: `- **0037 (\`0037_amigos.sql\`)** — …`. */
function migrationsNoRegistro(): string[] {
  const doc = readFileSync(DOC, 'utf8')
  return [...doc.matchAll(/^- \*\*(\d{4}) \(`([^`]+\.sql)`\)\*\*/gm)].map((achado) => achado[1])
}

describe('registro de migrations em docs/pre-producao.md', () => {
  it('tem uma entrada para cada migration no disco', () => {
    // Falhou? A migration nova subiu sem contar o que resolve. A entrada vai
    // logo antes de "A partir da 0018 a sonda para de adivinhar".
    expect(migrationsNoRegistro()).toEqual(migrationsNoDisco())
  })

  it('cada entrada aponta para o arquivo que existe', () => {
    const doc = readFileSync(DOC, 'utf8')
    const noDisco = new Set(readdirSync(PASTA).filter((arquivo) => arquivo.endsWith('.sql')))

    const fantasmas = [...doc.matchAll(/^- \*\*\d{4} \(`([^`]+\.sql)`\)\*\*/gm)]
      .map((achado) => achado[1])
      .filter((arquivo) => !noDisco.has(arquivo))

    // Uma entrada que cita arquivo inexistente manda quem lê procurar um SQL
    // que não está lá — e o nome errado é o erro fácil, porque a entrada é
    // escrita à mão depois do arquivo.
    expect(fantasmas).toEqual([])
  })
})
