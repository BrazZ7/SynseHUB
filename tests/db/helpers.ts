import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { Client } from 'pg'

/**
 * Banco de teste construído a partir das migrations reais.
 *
 * Não há schema duplicado aqui de propósito: um schema paralelo escrito à mão
 * divergiria do de produção justamente nos detalhes que os testes existem para
 * proteger.
 */

export const DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres@localhost:5433/synse_test'

export const ALPHA = {
  authId: '11111111-1111-1111-1111-111111111111',
  orgId: 'aaaaaaaa-0000-0000-0000-000000000001',
  email: 'dona@alpha.test',
}
export const BETA = {
  authId: '22222222-2222-2222-2222-222222222222',
  orgId: 'bbbbbbbb-0000-0000-0000-000000000002',
  email: 'dono@beta.test',
}

/**
 * Há Postgres disponível?
 *
 * Sem banco os testes de banco pulam com aviso, em vez de falhar. Falhar aqui
 * puniria quem só quer rodar a suíte de lógica pura, e esconderia falhas reais
 * no meio de erros de conexão.
 */
export async function databaseAvailable(): Promise<boolean> {
  const client = new Client({ connectionString: DATABASE_URL, connectionTimeoutMillis: 2000 })
  try {
    await client.connect()
    await client.end()
    return true
  } catch {
    console.warn(
      `\n  Testes de banco pulados: nenhum PostgreSQL em ${DATABASE_URL}.` +
        `\n  Suba um e rode 'npm run test:db', ou defina TEST_DATABASE_URL.\n`,
    )
    return false
  }
}

export async function connect(): Promise<Client> {
  const client = new Client({ connectionString: DATABASE_URL })
  await client.connect()
  return client
}

/** O que o Supabase oferece de fábrica e as migrations assumem existir. */
const SUPABASE_SHIM = `
  create schema if not exists auth;
  create table if not exists auth.users (
    id uuid primary key default gen_random_uuid(),
    email text unique
  );
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  do $$ begin
    create role anon;
  exception when duplicate_object then null; end $$;
  do $$ begin
    create role authenticated;
  exception when duplicate_object then null; end $$;
  do $$ begin
    create role service_role;
  exception when duplicate_object then null; end $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant select on auth.users to authenticated, service_role;
`

/**
 * Privilégios padrão do schema `public` no Supabase.
 *
 * Aplicados ANTES das migrations, via `alter default privileges`, que é o que o
 * Supabase realmente faz na criação do projeto. Conceder depois desfaria os
 * `revoke` explícitos das migrations — foi assim que um teste chegou a passar
 * achando que a função de cadastro estava aberta ao anônimo.
 */
const SUPABASE_GRANTS = `
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public
    grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public
    grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public
    grant execute on functions to anon, authenticated, service_role;
`

export async function applyMigrations(client: Client) {
  await client.query('drop schema if exists public cascade; create schema public;')
  await client.query('drop schema if exists auth cascade;')
  await client.query(SUPABASE_SHIM)
  await client.query(SUPABASE_GRANTS)

  const dir = join(process.cwd(), 'src/db/migrations')
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.sql')).sort()) {
    await client.query(readFileSync(join(dir, file), 'utf8'))
  }
}

/**
 * Roda uma consulta como um papel do Supabase, com o JWT de alguém.
 *
 * `set local` só vale dentro de transação — fora dela o Postgres emite aviso e
 * ignora, e o teste passaria acreditando que exercitou a RLS quando na verdade
 * rodou como superusuário.
 */
export async function asUser<T = unknown>(
  client: Client,
  authId: string | null,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  await client.query('begin')
  try {
    if (authId) {
      await client.query('select set_config($1, $2, true)', ['request.jwt.claim.sub', authId])
      await client.query('set local role authenticated')
    } else {
      await client.query('set local role anon')
    }
    const result = await client.query(sql, params)
    return result.rows as T[]
  } finally {
    await client.query('commit')
  }
}

/** Duas academias concorrentes, cada uma com dono e alunos. */
export async function seedTwoGyms(client: Client, studentsPerGym = 3) {
  await client.query(
    `insert into auth.users (id, email) values ($1,$2), ($3,$4)`,
    [ALPHA.authId, ALPHA.email, BETA.authId, BETA.email],
  )
  await client.query(
    `insert into organizations (id, name, slug) values ($1,'Academia Alpha','alpha'), ($2,'Academia Beta','beta')`,
    [ALPHA.orgId, BETA.orgId],
  )

  for (const gym of [ALPHA, BETA]) {
    const { rows: plan } = await client.query(
      `insert into membership_plans (organization_id, name, price, billing_cycle)
       values ($1,'Mensal',109.9,'MONTHLY') returning id`,
      [gym.orgId],
    )

    const { rows } = await client.query(
      `insert into user_profiles (auth_user_id, name, email) values ($1,$2,$3) returning id`,
      [gym.authId, `Dono ${gym.orgId.slice(0, 5)}`, gym.email],
    )
    await client.query(
      `insert into organization_members (organization_id, user_profile_id, role) values ($1,$2,'OWNER')`,
      [gym.orgId, rows[0].id],
    )

    for (let i = 1; i <= studentsPerGym; i += 1) {
      const prefix = gym === ALPHA ? 'a' : 'b'
      const { rows: profile } = await client.query(
        `insert into user_profiles (name, email) values ($1,$2) returning id`,
        [`Aluno ${prefix}${i}`, `${prefix}${i}@alunos.test`],
      )
      const { rows: student } = await client.query(
        `insert into students (organization_id, user_profile_id) values ($1,$2) returning id`,
        [gym.orgId, profile[0].id],
      )
      await client.query(
        `insert into memberships (organization_id, student_id, plan_id, price, billing_day)
         values ($1,$2,$3,109.9,5)`,
        [gym.orgId, student[0].id, plan[0].id],
      )
      await client.query(
        `insert into charges (organization_id, student_id, description, amount, due_date, status)
         values ($1,$2,'Mensalidade',109.9,current_date,'PAID')`,
        [gym.orgId, student[0].id],
      )
      await client.query(
        `insert into check_ins (organization_id, student_id) values ($1,$2)`,
        [gym.orgId, student[0].id],
      )
    }
  }
}
