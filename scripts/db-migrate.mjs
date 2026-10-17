#!/usr/bin/env node
/**
 * Aplica as migrations de `src/db/migrations` em ordem.
 *
 * Uso:
 *   npm run db:migrate            → lista as migrations e mostra como aplicá-las
 *   npm run db:migrate -- --print → imprime o SQL consolidado no stdout
 *
 * Não executa SQL sozinho por decisão de segurança: aplicar DDL exige a
 * service role key e uma conexão direta ao Postgres. O caminho suportado é o
 * Supabase CLI (`supabase db push`) ou colar o SQL no SQL Editor do projeto.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const migrationsDir = join(root, 'src/db/migrations')

const files = readdirSync(migrationsDir)
  .filter((file) => file.endsWith('.sql'))
  .sort()

if (files.length === 0) {
  console.error('Nenhuma migration encontrada em src/db/migrations.')
  process.exit(1)
}

if (process.argv.includes('--print')) {
  for (const file of files) {
    process.stdout.write(`\n-- ===== ${file} =====\n`)
    process.stdout.write(readFileSync(join(migrationsDir, file), 'utf8'))
  }
  process.exit(0)
}

console.log('Migrations do SynseHub, na ordem de aplicação:\n')
for (const [index, file] of files.entries()) {
  const sql = readFileSync(join(migrationsDir, file), 'utf8')
  const statements = sql.split(';').filter((chunk) => chunk.trim().length > 0).length
  console.log(`  ${index + 1}. ${file}  (${statements} instruções)`)
}

console.log(`
Como aplicar:

  Opção A — Supabase CLI (recomendado)
    supabase link --project-ref <seu-project-ref>
    supabase db push

  Opção B — SQL Editor do Supabase
    npm run db:migrate -- --print > synsehub-schema.sql
    e cole o conteúdo no SQL Editor, na ordem acima.

Depois de migrar, rode 'npm run db:seed' para popular os dados de demonstração.
`)
