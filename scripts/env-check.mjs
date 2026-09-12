#!/usr/bin/env node
/**
 * Mostra o estado do .env.local sem mostrar o conteúdo.
 *
 * Conferir variável de ambiente é rotina, e a forma óbvia de fazer isso — abrir
 * o arquivo no editor — coloca todas as credenciais na tela ao mesmo tempo. Um
 * print de tela, uma chamada compartilhada ou alguém passando atrás basta para
 * vazar a chave que dá acesso ao banco inteiro.
 *
 * Aqui aparecem nome, se está preenchida, o tamanho e o começo do valor quando
 * ele é público por natureza. Nunca o segredo.
 *
 *   npm run env:check
 */
import { loadEnvFile } from './lib/env-file.mjs'

loadEnvFile('.env.local')

/** Variáveis públicas por desenho: prefixo visível ajuda a achar erro de cópia. */
const PUBLICAS = new Set([
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_SYNSE_ENV',
  'PAYMENT_PROVIDER',
  'ASAAS_API_URL',
  'SEED_OWNER_EMAIL',
])

const ESPERADAS = [
  { nome: 'NEXT_PUBLIC_SUPABASE_URL', obrigatoria: true, tamanho: 40 },
  { nome: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', obrigatoria: true, tamanho: 46 },
  { nome: 'SUPABASE_SERVICE_ROLE_KEY', obrigatoria: true },
  { nome: 'NEXT_PUBLIC_APP_URL', obrigatoria: false },
  { nome: 'SEED_OWNER_EMAIL', obrigatoria: false },
  { nome: 'PAYMENT_PROVIDER', obrigatoria: false },
  { nome: 'ASAAS_API_KEY', obrigatoria: false },
  { nome: 'ASAAS_API_URL', obrigatoria: false },
  { nome: 'ASAAS_WEBHOOK_TOKEN', obrigatoria: false },
  { nome: 'SYNSE_PLATFORM_WALLET_ID', obrigatoria: false },
]

/** Sobrou o exemplo no lugar do valor? Acontece, e o erro depois é confuso. */
function pareceExemplo(valor) {
  return /^<.*>$/.test(valor) || /cole_aqui|troque|exemplo|seu_|your_/i.test(valor)
}

let problemas = 0

console.log('\n  variável                        situação\n  ' + '─'.repeat(62))

for (const { nome, obrigatoria, tamanho } of ESPERADAS) {
  const valor = process.env[nome]?.trim() ?? ''
  const coluna = nome.padEnd(32)

  if (!valor) {
    if (obrigatoria) {
      problemas += 1
      console.log(`  ${coluna}AUSENTE — é obrigatória`)
    } else {
      console.log(`  ${coluna}—`)
    }
    continue
  }

  if (pareceExemplo(valor)) {
    problemas += 1
    console.log(`  ${coluna}ainda é o texto de exemplo`)
    continue
  }

  if (tamanho && valor.length !== tamanho) {
    problemas += 1
    console.log(`  ${coluna}${valor.length} caracteres — esperado ${tamanho}`)
    continue
  }

  // Valor público pode aparecer; segredo mostra só o tamanho.
  const detalhe = PUBLICAS.has(nome) ? valor : `definida (${valor.length} caracteres)`
  console.log(`  ${coluna}${detalhe}`)
}

console.log()

if (problemas > 0) {
  console.log(`  ${problemas} ponto(s) a resolver.\n`)
  process.exitCode = 1
} else {
  console.log('  Tudo preenchido.\n')
}
