import { readFileSync } from 'node:fs'

/**
 * Carrega o `.env.local`.
 *
 * Ler esse arquivo é comportamento do Next.js, não do Node — rodando por
 * `node scripts/db-seed.mjs` o ambiente chega vazio, ainda que o arquivo
 * esteja preenchido. Sem isto o seed acusava variável ausente e mandava
 * defini-la exatamente onde ela já estava.
 *
 * Parser mínimo de propósito: o projeto não depende de `dotenv`, e aqui só
 * precisamos de `CHAVE=valor`. Variável já definida no shell tem precedência,
 * que é o que permite `SEED_OWNER_EMAIL=outro@email.com npm run db:seed`.
 */
export function loadEnvFile(path) {
  let content
  try {
    content = readFileSync(path, 'utf8')
  } catch (error) {
    // Arquivo ausente é caso normal: quem define é o shell. Qualquer outra
    // falha — permissão, disco — precisa aparecer, e não sumir num catch.
    if (error.code === 'ENOENT') return
    throw error
  }

  for (const line of content.split('\n')) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!match) continue // Comentário, linha vazia ou valor solto sem chave.

    const [, key, rawValue] = match
    if (process.env[key] !== undefined) continue

    // Aspas em volta são delimitador, não parte do valor.
    process.env[key] = rawValue.trim().replace(/^(['"])(.*)\1$/s, '$2')
  }
}
