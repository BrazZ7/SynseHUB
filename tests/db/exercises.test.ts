import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { applyMigrations, asUser, connect, databaseAvailable, seedTwoGyms, ALPHA, BETA } from './helpers'

/**
 * A biblioteca de exercícios.
 *
 * O defeito que ela corrige era invisível: a tabela existia desde a 0003, o
 * modo demonstração tinha exercícios falsos, e só quem foi montar treino de
 * verdade descobriu a lista vazia. Estes testes existem para que o catálogo
 * não volte a ficar incoerente em silêncio.
 */

let client: Client
const temBanco = await databaseAvailable()

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)
  await seedTwoGyms(client, 1)
}, 60_000)

afterAll(async () => {
  await client?.end()
})

const contar = (sql: string, params: unknown[] = []) =>
  client.query(`select count(*)::int as total from exercises where ${sql}`, params).then(
    (r) => r.rows[0].total as number,
  )

describe.skipIf(!temBanco)('catálogo', () => {
  it('não está vazio, que era o defeito', async () => {
    expect(await contar('slug is not null')).toBeGreaterThan(100)
  })

  it('todo exercício da plataforma pertence a todas as academias', async () => {
    // `organization_id` nulo é o que faz a política da 0004 liberar a leitura
    // para qualquer academia, e a escrita para nenhuma.
    expect(await contar('slug is not null and organization_id is not null')).toBe(0)
  })

  it('cada um tem região, padrão, mecânica e equipamento', async () => {
    expect(
      await contar(
        `slug is not null and (region is null or pattern is null or mechanics is null
          or utility is null or equipment_type is null or level is null)`,
      ),
    ).toBe(0)
  })

  it('músculo alvo só falta no que não tem músculo alvo', async () => {
    const { rows } = await client.query(
      `select muscle_group from exercises where slug is not null and primary_muscle is null`,
    )
    // Correr na esteira não tem "músculo alvo": o alvo é o sistema
    // cardiovascular. Fingir um músculo ali seria pior que deixar nulo.
    for (const linha of rows) expect(['CARDIO', 'FULL_BODY']).toContain(linha.muscle_group)
  })

  it('o músculo alvo nunca aparece também como sinergista', async () => {
    expect(await contar('primary_muscle = any(secondary_muscles)')).toBe(0)
  })

  it('padrão de isolamento só existe em exercício isolado', async () => {
    // Um exercício de uma articulação só não pode estar marcado como
    // multiarticular — é a incoerência que passa despercebida numa lista longa.
    expect(await contar(`pattern = 'ISOLATION' and mechanics <> 'ISOLATION'`)).toBe(0)
  })

  it('as quatro regiões estão cobertas, e nenhuma ficou de fora', async () => {
    const { rows } = await client.query(
      `select region, count(*)::int as total from exercises
       where slug is not null group by region order by region`,
    )
    const porRegiao = Object.fromEntries(rows.map((l) => [l.region, l.total]))
    expect(porRegiao.UPPER_BODY).toBeGreaterThan(30)
    expect(porRegiao.LOWER_BODY).toBeGreaterThan(20)
    expect(porRegiao.CORE).toBeGreaterThan(8)
    expect(porRegiao.FULL_BODY).toBeGreaterThan(5)
  })

  it('todo músculo do vocabulário tem pelo menos um exercício', async () => {
    /*
     * O que este teste impede: alguém abre "bíceps" na tela e encontra a lista
     * vazia, porque o valor existe no enum e nenhum exercício aponta para ele.
     */
    const { rows } = await client.query(`
      select m.valor
      from unnest(enum_range(null::muscle_target)) as m(valor)
      where not exists (
        select 1 from exercises e
        where e.primary_muscle = m.valor or m.valor = any(e.secondary_muscles)
      )
    `)
    expect(rows.map((l) => l.valor)).toEqual([])
  })

  it('todo grupo muscular tem exercício básico e auxiliar', async () => {
    // Só auxiliares num grupo significa que falta o exercício que sustenta o
    // treino dele.
    const { rows } = await client.query(`
      select muscle_group from exercises
      where slug is not null and muscle_group not in ('CARDIO','FULL_BODY')
      group by muscle_group
      having count(*) filter (where utility = 'BASIC') = 0
    `)
    expect(rows.map((l) => l.muscle_group)).toEqual([])
  })

  it('nome e apelido não colidem entre exercícios diferentes', async () => {
    const { rows } = await client.query(`
      with nomes as (
        select id, lower(name) as termo from exercises where slug is not null
        union all
        select id, lower(a) from exercises, unnest(aliases) a where slug is not null
      )
      select termo, count(distinct id)::int as quantos
      from nomes group by termo having count(distinct id) > 1
    `)
    // Dois exercícios com o mesmo apelido fazem a busca devolver o errado.
    expect(rows).toEqual([])
  })
})

describe.skipIf(!temBanco)('busca', () => {
  const buscar = (termo: string, authId: string | null = ALPHA.authId) =>
    asUser<{ name: string }>(client, authId, `select name from search_exercises($1)`, [termo])

  it('acha pelo nome, sem acento e sem ligar para maiúscula', async () => {
    const r = await buscar('TRICEPS')
    expect(r.length).toBeGreaterThan(5)
    expect(r.every((l) => /Tríceps|Mergulho|Supino fechado/i.test(l.name))).toBe(true)
  })

  it('acha pelo apelido regional', async () => {
    /*
     * É o ponto dos apelidos: quem aprendeu "cavalinho" digita cavalinho, e se
     * não achar conclui que o exercício não existe no sistema.
     */
    expect((await buscar('cavalinho')).map((l) => l.name)).toContain('Remada baixa na polia')
    expect((await buscar('pulley frente')).map((l) => l.name)).toContain(
      'Puxada frontal pegada aberta',
    )
    expect((await buscar('peck deck')).map((l) => l.name)).toContain('Voador (peck deck)')
    expect((await buscar('serrote')).map((l) => l.name)).toContain(
      'Remada unilateral com halter',
    )
  })

  it('termo vazio devolve o catálogo inteiro', async () => {
    expect((await buscar('')).length).toBeGreaterThan(100)
  })

  it('academia nenhuma perde o catálogo da plataforma', async () => {
    // Duas academias diferentes enxergam a mesma biblioteca base.
    const alpha = await buscar('agachamento', ALPHA.authId)
    const beta = await buscar('agachamento', BETA.authId)
    expect(alpha.length).toBeGreaterThan(3)
    expect(beta.map((l) => l.name).sort()).toEqual(alpha.map((l) => l.name).sort())
  })
})

describe.skipIf(!temBanco)('o catálogo não é editável pelo cliente', () => {
  it('academia não altera exercício da plataforma', async () => {
    const { rows } = await client.query(
      `select id from exercises where slug = 'agachamento-livre'`,
    )

    await asUser(client, ALPHA.authId, `update exercises set name = 'Meu agachamento' where id = $1`, [
      rows[0].id,
    ])

    // A política filtra por organização: a linha da plataforma não é alcançada
    // e o update passa sem tocar em nada. O que não pode é o nome mudar.
    const depois = await client.query(`select name from exercises where id = $1`, [rows[0].id])
    expect(depois.rows[0].name).toBe('Agachamento livre')
  })

  it('academia não apaga exercício da plataforma', async () => {
    const antes = await contar('slug is not null')
    await asUser(client, ALPHA.authId, `delete from exercises where slug is not null`)
    expect(await contar('slug is not null')).toBe(antes)
  })

  it('academia pode criar o exercício dela, e a outra não vê', async () => {
    await asUser(
      client,
      ALPHA.authId,
      `insert into exercises (organization_id, name, muscle_group, region, primary_muscle)
       values ($1, 'Puxada na corda de escalada', 'BACK', 'UPPER_BODY', 'LATS')`,
      [ALPHA.orgId],
    )

    const daAlpha = await asUser<{ name: string }>(
      client,
      ALPHA.authId,
      `select name from search_exercises('corda de escalada', $1)`,
      [ALPHA.orgId],
    )
    expect(daAlpha.map((l) => l.name)).toContain('Puxada na corda de escalada')

    const daBeta = await asUser<{ name: string }>(
      client,
      BETA.authId,
      `select name from search_exercises('corda de escalada', $1)`,
      [BETA.orgId],
    )
    expect(daBeta).toEqual([])
  })
})
