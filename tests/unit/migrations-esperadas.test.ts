import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * A lista de migrations da sonda de saúde não pode ficar para trás.
 *
 * `MIGRATIONS_ESPERADAS`, em `src/app/api/health/route.ts`, é mantida à mão, e
 * é ela que `/api/health?deep=1` compara com `schema_migrations` para dizer o
 * que falta subir. Uma migration nova que não entre na lista some da sonda: o
 * endereço responde `pendingMigrations: []` com o banco desatualizado, que é
 * pior do que não ter sonda — é uma sonda que mente.
 *
 * Nada checava isso. Este teste checa, e não precisa de banco: basta comparar
 * a lista com os arquivos no disco.
 */

const PASTA = join(process.cwd(), 'src/db/migrations')
const ROTA = join(process.cwd(), 'src/app/api/health/route.ts')

/**
 * De onde a lista começa.
 *
 * A sonda não cobre 0001–0012: elas são o esquema-base, e um banco sem elas
 * não chega a responder. A lista nasce na 0013 por isso, e o teste respeita o
 * mesmo corte em vez de exigir as doze primeiras.
 */
const PRIMEIRA_VIGIADA = '0013'

function migrationsNoDisco(): string[] {
  return readdirSync(PASTA)
    .filter((arquivo) => arquivo.endsWith('.sql'))
    .filter((arquivo) => arquivo.slice(0, 4) >= PRIMEIRA_VIGIADA)
    .sort()
}

function migrationsNaSonda(): string[] {
  const fonte = readFileSync(ROTA, 'utf8')
  const bloco = fonte.match(/const MIGRATIONS_ESPERADAS = \[([\s\S]*?)\]/)
  if (!bloco) throw new Error('MIGRATIONS_ESPERADAS não encontrada em src/app/api/health/route.ts')

  return [...bloco[1].matchAll(/'([^']+\.sql)'/g)].map((achado) => achado[1])
}

describe('MIGRATIONS_ESPERADAS', () => {
  it('lista exatamente as migrations que existem no disco', () => {
    // Falhou? A migration nova não entrou na lista da sonda — ou foi apagada
    // do disco sem sair dela.
    expect(migrationsNaSonda()).toEqual(migrationsNoDisco())
  })

  it('está em ordem, para a leitura do endereço fazer sentido', () => {
    const lista = migrationsNaSonda()
    expect(lista).toEqual([...lista].sort())
  })

  it('não repete versão', () => {
    const lista = migrationsNaSonda()
    expect(new Set(lista).size).toBe(lista.length)
  })
})

/**
 * O registro de cada migration, conferido no texto.
 *
 * `tests/db/schema-migrations.test.ts` já confere isto rodando o SQL — mas só
 * quando há Postgres no ar, e a suíte de banco **pula em silêncio** quando não
 * há. Uma migration sem a linha de registro passaria verde numa máquina sem
 * banco e só apareceria em produção, onde o sintoma é a sonda dizer que falta
 * subir uma migration que já subiu.
 *
 * O corte é a 0018 porque foi ela que **criou** `schema_migrations`. As
 * anteriores não tinham onde se registrar, e é a própria 0018 que as insere
 * retroativamente, conferindo marca por marca ("existe a tabela `activities`?
 * então a 0016 subiu"). Exigir a linha delas seria exigir um insert numa
 * tabela que ainda não existia.
 */
const PRIMEIRA_QUE_SE_REGISTRA = '0018'

describe('registro de cada migration', () => {
  it('toda migration da 0018 em diante termina se registrando', () => {
    const semRegistro = migrationsNoDisco()
      .filter((arquivo) => arquivo.slice(0, 4) >= PRIMEIRA_QUE_SE_REGISTRA)
      .filter((arquivo) => {
        const sql = readFileSync(join(PASTA, arquivo), 'utf8')
        return !sql.includes(`insert into schema_migrations (version) values ('${arquivo}')`)
      })

    expect(semRegistro).toEqual([])
  })

  it('as anteriores à 0018 são registradas por ela, e não por si mesmas', () => {
    // Se esta lista mudar, a 0018 precisa mudar junto — senão a sonda passa a
    // acusar como pendente uma migration que subiu há anos.
    const anteriores = migrationsNoDisco().filter(
      (arquivo) => arquivo.slice(0, 4) < PRIMEIRA_QUE_SE_REGISTRA,
    )
    const zeroDezoito = readFileSync(join(PASTA, '0018_reativacao_avisa.sql'), 'utf8')

    for (const arquivo of anteriores) {
      expect(zeroDezoito, `0018 não registra ${arquivo}`).toContain(`'${arquivo}'`)
    }
  })
})
