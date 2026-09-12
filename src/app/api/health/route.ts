import { NextResponse } from 'next/server'

import { APP } from '@/config/app'
import { SUPABASE_ANON_KEY, SUPABASE_URL, isDemoMode } from '@/lib/database/env'
import { getPaymentProvider } from '@/lib/payments'
import { env } from '@/lib/env'

export const dynamic = 'force-dynamic'

/**
 * Início do identificador do projeto Supabase — o suficiente para conferir que
 * o que está no ar aponta para o banco certo, e curto demais para servir de
 * endereço. "Está em produção o mesmo projeto que eu populei?" é uma pergunta
 * que já custou horas de investigação no lugar errado.
 */
function databaseRef(): string | null {
  const host = URL.canParse(SUPABASE_URL) ? new URL(SUPABASE_URL).hostname : ''
  const ref = host.split('.')[0]
  return ref ? `${ref.slice(0, 8)}…` : null
}

/**
 * Formato da chave pública, sem revelar a chave.
 *
 * `NEXT_PUBLIC_*` é embutida no código durante o build, então a que está em uso
 * pode ser mais velha que a que está no painel. O prefixo distingue as três
 * confusões que acontecem de verdade — chave publicável (`sb_publishable_`),
 * chave secreta colada no lugar errado (`sb_secret_`) e JWT antiga (`eyJ…`) —
 * e o tamanho denuncia um valor cortado na colagem ou com aspas em volta.
 */
function databaseKey(): { prefix: string; length: number } | null {
  if (!SUPABASE_ANON_KEY) return null
  return { prefix: `${SUPABASE_ANON_KEY.slice(0, 15)}…`, length: SUPABASE_ANON_KEY.length }
}

/**
 * Pergunta ao Supabase se ele aceita a chave desta build.
 *
 * Sem isto, uma chave recusada chega ao usuário como "e-mail ou senha
 * incorretos" e manda todo mundo procurar a senha. Fica atrás de `?deep=1`
 * porque é uma chamada de rede: a sonda comum precisa continuar barata.
 */
async function databaseReachable(): Promise<{ ok: boolean; status: number | null }> {
  try {
    const resposta = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: SUPABASE_ANON_KEY },
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    })
    return { ok: resposta.ok, status: resposta.status }
  } catch {
    return { ok: false, status: null }
  }
}

/**
 * O banco já tem o que esta build pede?
 *
 * Publicar e migrar são dois atos separados: a Vercel publica no push, o SQL
 * é colado à mão no painel do Supabase. Entre um e outro, o código novo fala
 * com o banco velho. Quando isso aconteceu, o sintoma que chegou foi "o login
 * não responde" — e descobrir a causa exigiu ler código, porque nada no ar
 * dizia qual dos dois lados estava atrasado.
 *
 * Agora diz. Cada sonda é uma consulta com a chave pública, que a RLS responde
 * com lista vazia; o que interessa não é o conteúdo, é o schema aceitar a
 * pergunta. Fica atrás de `?deep=1`, junto das outras chamadas de rede.
 */
type SchemaProbe = { present: boolean | null; status: number | null }

async function schemaCheck(recurso: string): Promise<SchemaProbe> {
  try {
    const resposta = await fetch(`${SUPABASE_URL}/rest/v1/${recurso}`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    })

    // 400 com 42703 (coluna) e 404 com PGRST205 (tabela) são "ainda não existe".
    // 200 com lista vazia é a RLS negando linha, o que só acontece se o schema
    // aceitou a pergunta. O resto — 401, 403, 5xx — fala de credencial ou de
    // indisponibilidade, e o status vai junto para não virar adivinhação.
    if (resposta.ok) return { present: true, status: resposta.status }
    if (resposta.status === 400 || resposta.status === 404) {
      return { present: false, status: resposta.status }
    }
    return { present: null, status: resposta.status }
  } catch {
    return { present: null, status: null }
  }
}

async function schemaReadiness() {
  const [tier, desafios] = await Promise.all([
    schemaCheck('user_profiles?select=tier&limit=1'),
    schemaCheck('baseline_challenges?select=code&limit=1'),
  ])

  const pendentes: string[] = []
  if (tier.present === false || desafios.present === false) {
    pendentes.push('0014_baseline_experience.sql')
  }

  return { userProfilesTier: tier, baselineChallenges: desafios, pendingMigrations: pendentes }
}

/**
 * Contra qual ambiente do provedor de pagamento o app fala.
 *
 * "Está batendo no sandbox ou em produção?" é a primeira pergunta de qualquer
 * suporte de gateway, e responder de memória erra. O host não é segredo — é
 * endereço público documentado — e o valor aqui é prova, não afirmação.
 */
function paymentEnvironment(): string | null {
  const url = env(process.env.ASAAS_API_URL, '')
  if (!url || !URL.canParse(url)) return null
  return new URL(url).hostname
}

/** Sonda de saúde. Não expõe segredo nem detalhe de infraestrutura. */
export async function GET(request: Request) {
  const demo = isDemoMode()
  const deep = new URL(request.url).searchParams.get('deep') === '1'

  return NextResponse.json({
    status: 'ok',
    app: APP.name,
    version: APP.version,
    environment: APP.env,
    appUrl: APP.url,
    database: demo ? 'demo' : 'supabase',
    databaseRef: demo ? null : databaseRef(),
    databaseKey: demo ? null : databaseKey(),
    ...(deep && !demo
      ? { databaseAuth: await databaseReachable(), schema: await schemaReadiness() }
      : {}),
    paymentProvider: getPaymentProvider().id,
    paymentProviderHost: paymentEnvironment(),
    timestamp: new Date().toISOString(),
  })
}
