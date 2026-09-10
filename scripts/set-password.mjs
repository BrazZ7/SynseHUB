#!/usr/bin/env node
/**
 * Define a senha de uma conta existente.
 *
 * As contas criadas pelo seed nascem sem senha — o acesso previsto é por link
 * no e-mail. Enquanto não houver SMTP próprio configurado, esse link não chega
 * a lugar nenhum, e este script é a forma de entrar sem depender de e-mail.
 *
 * Uso:
 *   npm run db:set-password                 → proprietário do seed
 *   npm run db:set-password -- outro@email  → outra conta
 *
 * A senha é digitada no terminal, com eco desligado. Passá-la por argumento a
 * gravaria no histórico do shell em texto puro.
 */
import { createInterface } from 'node:readline'

import { createClient } from '@supabase/supabase-js'

import { loadEnvFile } from './lib/env-file.mjs'

loadEnvFile('.env.local')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceRoleKey) {
  console.error(`
Faltam variáveis de ambiente.

  NEXT_PUBLIC_SUPABASE_URL   = ${url ? 'ok' : 'ausente'}
  SUPABASE_SERVICE_ROLE_KEY  = ${serviceRoleKey ? 'ok' : 'ausente'}

Defina as duas em .env.local.
`)
  process.exit(1)
}

const email = process.argv[2]?.trim() || process.env.SEED_OWNER_EMAIL?.trim()

if (!email) {
  console.error(`
Informe o e-mail da conta:

  npm run db:set-password -- voce@exemplo.com

Ou defina SEED_OWNER_EMAIL em .env.local.
`)
  process.exit(1)
}

/** Lê do terminal sem mostrar o que é digitado. */
function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })

    const onData = () => {
      // Reescreve a linha só com a pergunta, apagando o que foi digitado.
      process.stdout.clearLine?.(0)
      process.stdout.cursorTo?.(0)
      process.stdout.write(question)
    }

    process.stdin.on('data', onData)
    rl.question(question, (answer) => {
      process.stdin.off('data', onData)
      rl.close()
      process.stdout.write('\n')
      resolve(answer)
    })
  })
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function findUser(targetEmail) {
  // O admin do Supabase não expõe busca por e-mail: pagina e filtra.
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error

    const found = data.users.find(
      (user) => user.email?.toLowerCase() === targetEmail.toLowerCase(),
    )
    if (found) return found
    if (data.users.length < 200) return null
  }
  return null
}

async function main() {
  const user = await findUser(email)
  if (!user) {
    console.error(
      `\nNenhuma conta com o e-mail ${email}.` +
        `\nRode 'npm run db:seed' antes, ou confira o endereço.\n`,
    )
    process.exit(1)
  }

  const password = await askHidden(`Nova senha para ${email}: `)

  if (password.length < 8) {
    console.error('\nA senha precisa ter ao menos 8 caracteres — o mesmo mínimo da tela de login.\n')
    process.exit(1)
  }

  // Digitada duas vezes porque o eco está desligado: sem conferência, um erro
  // de digitação vira uma senha que ninguém conhece, e o login falha com a
  // mesma mensagem genérica de senha errada.
  const confirmation = await askHidden('Repita a senha: ')
  if (confirmation !== password) {
    console.error('\nAs duas senhas não coincidem. Nada foi alterado.\n')
    process.exit(1)
  }

  const { error } = await supabase.auth.admin.updateUserById(user.id, {
    password,
    email_confirm: true,
  })
  if (error) throw error

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  /*
   * Prova o login em vez de supor.
   *
   * Definir a senha e falhar no login depois deixa a pessoa sem saber se o
   * problema foi digitação, conta errada ou configuração — e a tela de login
   * responde a mesma mensagem genérica em todos os casos.
   */
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!anonKey) {
    console.log(`
Senha definida para ${email}.

Sem NEXT_PUBLIC_SUPABASE_ANON_KEY no .env.local não deu para testar o login
daqui. Entre em ${appUrl}/login e confira.
`)
    return
  }

  const asVisitor = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error: loginError } = await asVisitor.auth.signInWithPassword({ email, password })

  if (loginError || !data.session) {
    console.error(`
Senha definida, mas o login de teste falhou: ${loginError?.message ?? 'sem sessão'}

A senha foi gravada. Se o login pela tela também falhar, o problema não é a
senha — me mostre esta mensagem.
`)
    process.exit(1)
  }

  await asVisitor.auth.signOut()

  console.log(`
Senha definida e login testado com sucesso para ${email}.

Entre em ${appUrl}/login com e-mail e senha — sem passar por e-mail nenhum.
`)
}

main().catch((error) => {
  console.error('\nFalha:', error.message ?? error)
  process.exit(1)
})
