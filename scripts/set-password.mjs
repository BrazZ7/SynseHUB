#!/usr/bin/env node
/**
 * Define a senha de uma conta existente.
 *
 * As contas criadas pelo seed nascem sem senha — o acesso previsto é por link
 * no e-mail. Enquanto não houver SMTP próprio configurado, esse link não chega
 * a lugar nenhum, e este script é a forma de entrar sem depender de e-mail.
 *
 * Uso:
 *   npm run db:set-password                 → proprietário do seed, senha digitada
 *   npm run db:set-password -- outro@email  → outra conta
 *   npm run db:set-password -- --gerar      → o script sorteia a senha e mostra
 *
 * A senha digitada não passa por argumento: isso a gravaria no histórico do
 * shell em texto puro.
 */
import { randomInt } from 'node:crypto'
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

const args = process.argv.slice(2)
const gerar = args.includes('--gerar')
const email =
  args.find((arg) => !arg.startsWith('--'))?.trim() || process.env.SEED_OWNER_EMAIL?.trim()

if (!email) {
  console.error(`
Informe o e-mail da conta:

  npm run db:set-password -- voce@exemplo.com

Ou defina SEED_OWNER_EMAIL em .env.local.
`)
  process.exit(1)
}

/**
 * Sorteia uma senha forte.
 *
 * Sem I, l, O, 0 e 1: são os pares que se confundem na leitura de uma tela, e
 * uma senha lida errada falha com a mesma mensagem genérica de senha incorreta.
 * `randomInt` usa a fonte criptográfica do sistema — `Math.random` não serve
 * para credencial.
 */
function gerarSenha(tamanho = 20) {
  const alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  let senha = ''
  for (let i = 0; i < tamanho; i += 1) senha += alfabeto[randomInt(alfabeto.length)]
  return senha
}

/**
 * Lê do terminal sem mostrar o que é digitado.
 *
 * A supressão troca o método que o readline usa para escrever na tela. A versão
 * anterior deste script não desligava o eco de verdade: a senha aparecia
 * enquanto era digitada.
 */
function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })

    let mudo = false
    const escrever = rl._writeToOutput?.bind(rl)
    rl._writeToOutput = (texto) => {
      if (!mudo) return escrever?.(texto)
      // Deixa passar só o que redesenha a pergunta, nunca os caracteres.
      if (texto.includes(question)) escrever?.(question)
    }

    rl.question(question, (resposta) => {
      rl.close()
      process.stdout.write('\n')
      resolve(resposta)
    })
    mudo = true
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

    const found = data.users.find((user) => user.email?.toLowerCase() === targetEmail.toLowerCase())
    if (found) return found
    if (data.users.length < 200) return null
  }
  return null
}

/**
 * Pergunta a senha e confirma.
 *
 * Digitada duas vezes porque o eco está desligado: sem conferência, um erro de
 * digitação vira uma senha que ninguém conhece, e o login falha depois com a
 * mesma mensagem genérica de senha errada.
 */
async function pedirSenha() {
  const senha = await askHidden(`Nova senha para ${email}: `)
  console.log(`  (${senha.length} caracteres capturados)`)

  if (senha.length < 8) {
    console.error(
      '\nA senha precisa ter ao menos 8 caracteres — o mesmo mínimo da tela de login.\n',
    )
    process.exit(1)
  }

  const confirmacao = await askHidden('Repita a senha: ')
  if (confirmacao !== senha) {
    console.error('\nAs duas senhas não coincidem. Nada foi alterado.\n')
    process.exit(1)
  }

  return senha
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

  /*
   * Estado da conta antes de mexer.
   *
   * Uma conta com e-mail não confirmado é recusada no login mesmo com a senha
   * certa, e a tela responde "e-mail ou senha incorretos" — indistinguível de
   * senha errada. Mostrar isso aqui evita caçar o problema no lugar errado.
   */
  console.log(`
Conta encontrada
  id                 ${user.id}
  e-mail confirmado  ${user.email_confirmed_at ? 'sim' : 'NÃO — seria recusado no login'}
  provedores         ${(user.identities ?? []).map((i) => i.provider).join(', ') || 'nenhum'}
  último acesso      ${user.last_sign_in_at ?? 'nunca'}
`)

  const password = gerar ? gerarSenha() : await pedirSenha()

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
    if (gerar) mostrarSenha(password)
    return
  }

  const asVisitor = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error: loginError } = await asVisitor.auth.signInWithPassword({ email, password })

  if (loginError || !data.session) {
    console.error(`
Senha definida, mas o login de teste falhou.

  mensagem  ${loginError?.message ?? 'sem sessão'}
  código    ${loginError?.code ?? '—'}
  status    ${loginError?.status ?? '—'}

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

  if (gerar) mostrarSenha(password)
}

/**
 * Mostra a senha sorteada, uma vez, no terminal de quem rodou o script.
 *
 * Não fica gravada em lugar nenhum: nem no histórico do shell (não veio por
 * argumento), nem no repositório. Quem quiser guardar copia daqui para um
 * gerenciador de senhas.
 */
function mostrarSenha(password) {
  console.log(`Senha sorteada — anote agora, ela não será mostrada de novo:

    ${password}

Troque por uma sua assim que entrar.
`)
}

main().catch((error) => {
  console.error('\nFalha:', error.message ?? error)
  process.exit(1)
})
