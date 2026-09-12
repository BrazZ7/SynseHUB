import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  ALPHA,
  BETA,
  applyMigrations,
  asUser,
  connect,
  databaseAvailable,
  seedTwoGyms,
} from './helpers'

/**
 * O isolamento entre academias é a promessa central do produto. Se ele falhar,
 * uma academia lê a base de alunos da concorrente.
 */

let client: Client
const temBanco = await databaseAvailable()

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)
  await seedTwoGyms(client)
}, 60_000)

afterAll(async () => {
  await client?.end()
})

const contar = async (authId: string | null, tabela: string) => {
  const rows = await asUser<{ n: string }>(
    client,
    authId,
    `select count(*)::text as n from ${tabela}`,
  )
  return Number(rows[0].n)
}

describe.skipIf(!temBanco)('isolamento entre academias', () => {
  for (const tabela of ['students', 'charges', 'check_ins', 'memberships']) {
    it(`${tabela}: cada dona vê só a própria academia`, async () => {
      const total = Number(
        (await client.query(`select count(*)::text as n from ${tabela}`)).rows[0].n,
      )
      const alpha = await contar(ALPHA.authId, tabela)
      const beta = await contar(BETA.authId, tabela)

      expect(alpha).toBeGreaterThan(0)
      expect(beta).toBeGreaterThan(0)
      // A soma exata é o que prova que ninguém enxerga linha da outra.
      expect(alpha + beta).toBe(total)
    })
  }

  it('organizations: cada dona vê apenas a própria', async () => {
    const alpha = await asUser<{ slug: string }>(
      client,
      ALPHA.authId,
      'select slug from organizations',
    )
    const beta = await asUser<{ slug: string }>(
      client,
      BETA.authId,
      'select slug from organizations',
    )

    expect(alpha.map((row) => row.slug)).toEqual(['alpha'])
    expect(beta.map((row) => row.slug)).toEqual(['beta'])
  })
})

describe.skipIf(!temBanco)('acesso anônimo', () => {
  for (const tabela of ['organizations', 'user_profiles', 'students', 'charges', 'check_ins']) {
    it(`${tabela}: não lê nada — e não estoura`, async () => {
      // Erro em vez de lista vazia viraria 500 no app. Já aconteceu: revogar as
      // funções auxiliares do papel `anon` fazia o Postgres abortar a consulta.
      await expect(contar(null, tabela)).resolves.toBe(0)
    })
  }

  it('não consegue criar academia', async () => {
    await expect(
      asUser(client, null, `insert into organizations (name, slug) values ('Invasora','invasora')`),
    ).rejects.toThrow(/row-level security/i)
  })
})

describe.skipIf(!temBanco)('usuário autenticado sem vínculo', () => {
  const semVinculo = '99999999-9999-9999-9999-999999999999'

  it('não lê academia nenhuma', async () => {
    expect(await contar(semVinculo, 'organizations')).toBe(0)
    expect(await contar(semVinculo, 'students')).toBe(0)
  })
})

describe.skipIf(!temBanco)('equipe enxerga o nome dos próprios alunos', () => {
  it('o join com user_profiles devolve nome e Synse ID', async () => {
    // Regressão da 0005: a RLS liberava a matrícula e bloqueava o perfil, então
    // a lista de alunos vinha inteira sem nome.
    const rows = await asUser<{ name: string; synse_id: string }>(
      client,
      ALPHA.authId,
      `select p.name, p.synse_id
       from students s join user_profiles p on p.id = s.user_profile_id
       where s.organization_id = $1`,
      [ALPHA.orgId],
    )

    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.name).toBeTruthy()
      expect(row.synse_id).toMatch(/^SYN-[0-9A-HJKMNP-TV-Z]{8}$/)
    }
  })

  it('não enxerga o perfil de aluno da concorrente', async () => {
    const rows = await asUser<{ n: string }>(
      client,
      ALPHA.authId,
      `select count(*)::text as n from user_profiles where email like 'b%@alunos.test'`,
    )
    expect(Number(rows[0].n)).toBe(0)
  })
})

describe.skipIf(!temBanco)('credencial da subconta', () => {
  /*
   * A chave de API da subconta movimenta o dinheiro da academia. Ela vive numa
   * tabela com RLS ligada e nenhuma política: só o service role, que existe
   * apenas no servidor, alcança essas linhas.
   *
   * A ausência de política é a proteção. Este teste é o que impede alguém, mais
   * adiante, "consertar" a tabela adicionando uma regra de leitura — e entregar
   * a credencial a quem entrar no painel.
   */
  beforeAll(async () => {
    await client.query(
      `insert into payment_accounts (organization_id, provider, provider_account_id, status)
       values ($1, 'asaas', 'wallet_alpha', 'ACTIVE')
       on conflict (organization_id, provider) do nothing`,
      [ALPHA.orgId],
    )
    await client.query(
      `insert into payment_account_secrets (payment_account_id, organization_id, provider, api_key)
       select id, organization_id, 'asaas', 'chave-da-subconta-alpha'
       from payment_accounts where organization_id = $1 and provider = 'asaas'
       on conflict (payment_account_id) do nothing`,
      [ALPHA.orgId],
    )
  })

  it('existe de fato — o teste seguinte só vale se houver linha para esconder', async () => {
    const { rows } = await client.query<{ n: string }>(
      `select count(*)::text as n from payment_account_secrets`,
    )
    expect(Number(rows[0].n)).toBeGreaterThan(0)
  })

  /*
   * A recusa aqui é erro, não lista vazia — escolha oposta à da 0008.
   *
   * Lá, o visitante anônimo consulta tabelas legítimas e precisa receber nada
   * em vez de erro 500. Aqui ninguém deveria consultar esta tabela pelo cliente
   * em hipótese alguma, então falhar alto é o certo: uma tentativa acidental
   * aparece no log em vez de passar despercebida como resultado vazio.
   */
  it('a dona da própria academia esbarra em permission denied', async () => {
    await expect(
      asUser(client, ALPHA.authId, 'select api_key from payment_account_secrets'),
    ).rejects.toThrow(/permission denied/i)
  })

  it('visitante anônimo idem', async () => {
    await expect(
      asUser(client, null, 'select api_key from payment_account_secrets'),
    ).rejects.toThrow(/permission denied/i)
  })

  it('nem escreve uma linha nova para si', async () => {
    await expect(
      asUser(
        client,
        ALPHA.authId,
        `insert into payment_account_secrets (payment_account_id, organization_id, provider, api_key)
         select id, organization_id, 'asaas', 'chave-plantada' from payment_accounts limit 1`,
      ),
    ).rejects.toThrow()
  })
})

describe.skipIf(!temBanco)('aluno enxerga a própria academia — e só ela', () => {
  /*
   * `organizations_read` exigia vínculo em organization_members, e aluno não é
   * membro: ele tem matrícula. Sem isto o Synse App mostra o nome da academia
   * em branco. O defeito era anterior e só apareceria em produção, porque a
   * demonstração não passa pela RLS.
   */
  const ALUNO_ALPHA = '77777777-7777-7777-7777-777777777777'

  beforeAll(async () => {
    await client.query(
      `insert into auth.users (id, email) values ($1,'aluno.alpha@x.com') on conflict do nothing`,
      [ALUNO_ALPHA],
    )
    await client.query(
      `insert into user_profiles (auth_user_id, name, email)
       values ($1, 'Aluno Alpha', 'aluno.alpha@x.com')
       on conflict (auth_user_id) do nothing`,
      [ALUNO_ALPHA],
    )
    await client.query(
      `insert into students (organization_id, user_profile_id, status)
       select $1, id, 'ACTIVE' from user_profiles where auth_user_id = $2
       on conflict do nothing`,
      [ALPHA.orgId, ALUNO_ALPHA],
    )
  })

  it('lê o nome da academia em que está matriculado', async () => {
    const rows = await asUser<{ name: string }>(
      client,
      ALUNO_ALPHA,
      'select name from organizations',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBeTruthy()
  })

  it('não lê a base de alunos da academia — matrícula não é acesso de equipe', async () => {
    const rows = await asUser<{ n: string }>(
      client,
      ALUNO_ALPHA,
      'select count(*)::text as n from students',
    )
    // Enxerga a própria matrícula, nunca a dos colegas.
    expect(Number(rows[0].n)).toBe(1)
  })

  it('não enxerga a academia concorrente', async () => {
    const rows = await asUser<{ n: string }>(
      client,
      ALUNO_ALPHA,
      'select count(*)::text as n from organizations where id = $1',
      [BETA.orgId],
    )
    expect(Number(rows[0].n)).toBe(0)
  })
})
