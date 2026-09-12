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

/**
 * A função existe no banco?
 *
 * A 0013 não cria tabela nem coluna — cria função. Sem uma sonda para ela, o
 * relatório dizia "só falta a 0014" enquanto o cadastro sem código falhava por
 * falta da 0013, e a diferença custou uma rodada inteira de diagnóstico.
 *
 * O POST não executa nada: a função é negada ao anônimo por `revoke`, então a
 * resposta é 401 ou 403 quando ela existe, e 404 (PGRST202) quando não existe.
 * É a diferença entre "sem permissão" e "não encontrada" que responde.
 */
async function rpcCheck(nome: string, corpo: Record<string, unknown>): Promise<SchemaProbe> {
  try {
    const resposta = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${nome}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    })

    if (resposta.status === 404) return { present: false, status: 404 }
    if (resposta.status === 401 || resposta.status === 403) {
      return { present: true, status: resposta.status }
    }
    return { present: null, status: resposta.status }
  } catch {
    return { present: null, status: null }
  }
}

/**
 * As migrations que o banco diz ter aplicado.
 *
 * A partir da 0018 existe `schema_migrations`, e a resposta deixa de ser
 * dedução. As sondas de formato continuam logo abaixo por dois motivos: bancos
 * que ainda não receberam a 0018 não têm a tabela, e uma coluna que sumiu por
 * qualquer outro caminho não apareceria num registro que só guarda o que rodou.
 */
async function migracoesRegistradas(): Promise<string[] | null> {
  try {
    const resposta = await fetch(
      `${SUPABASE_URL}/rest/v1/schema_migrations?select=version&order=version`,
      {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        signal: AbortSignal.timeout(5000),
        cache: 'no-store',
      },
    )
    if (!resposta.ok) return null
    const linhas = (await resposta.json()) as Array<{ version: string }>
    return linhas.map((linha) => linha.version)
  } catch {
    return null
  }
}

/** O que este código espera encontrar no banco. */
const MIGRATIONS_ESPERADAS = [
  '0013_synse_solo.sql',
  '0014_baseline_experience.sql',
  '0015_professional_unlock.sql',
  '0016_synse_run.sql',
  '0017_consentimento.sql',
  '0018_reativacao_avisa.sql',
]

async function schemaReadiness() {
  const [tier, desafios, profissional, entradaSemVinculo, corridas, consentimento] =
    await Promise.all([
      schemaCheck('user_profiles?select=tier&limit=1'),
      schemaCheck('baseline_challenges?select=code&limit=1'),
      schemaCheck('user_profiles?select=professional_plan&limit=1'),
      rpcCheck('join_synse_as_solo_student', { p_student_name: 'sonda' }),
      schemaCheck('activities?select=id&limit=1'),
      /*
       * `consent_documents` é legível pelo anônimo de propósito — a tela de
       * privacidade precisa do catálogo antes do login. Aqui isso ajuda: a
       * sonda distingue "tabela não existe" de "sem permissão" sem depender de
       * sessão.
       */
      schemaCheck('consent_documents?select=consent_type&limit=1'),
    ])

  const registradas = await migracoesRegistradas()

  /*
   * Com o registro no ar, ele manda: é a única fonte que enxerga migration sem
   * forma própria, como a 0018. Sem ele, valem as sondas de formato — que é
   * como funcionava até a 0018 existir.
   */
  if (registradas) {
    const faltando = MIGRATIONS_ESPERADAS.filter((versao) => !registradas.includes(versao))
    return {
      synseRun: corridas,
      entradaSemVinculo,
      userProfilesTier: tier,
      baselineChallenges: desafios,
      professionalPlan: profissional,
      consentimento,
      appliedMigrations: registradas.length,
      pendingMigrations: faltando,
    }
  }

  const pendentes: string[] = []
  if (entradaSemVinculo.present === false) pendentes.push('0013_synse_solo.sql')
  if (tier.present === false || desafios.present === false) {
    pendentes.push('0014_baseline_experience.sql')
  }
  if (profissional.present === false) pendentes.push('0015_professional_unlock.sql')
  if (corridas.present === false) pendentes.push('0016_synse_run.sql')
  if (consentimento.present === false) pendentes.push('0017_consentimento.sql')
  // Sem `schema_migrations`, a 0018 não subiu — ela é quem cria a tabela.
  pendentes.push('0018_reativacao_avisa.sql')

  return {
    synseRun: corridas,
    entradaSemVinculo,
    userProfilesTier: tier,
    baselineChallenges: desafios,
    professionalPlan: profissional,
    consentimento,
    pendingMigrations: pendentes,
  }
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

/**
 * Qual commit está no ar.
 *
 * Publicar é assíncrono: eu envio a correção, a Vercel constrói, e no meio
 * disso a pessoa testa a versão antiga e relata que "continua errado". Sem
 * este campo a única forma de conferir era comparar nomes de arquivo estático
 * entre a build local e a publicada — que mudam por motivos que nada têm a ver
 * com o commit, e já me fizeram concluir errado. O hash curto é público:
 * qualquer um lê o mesmo no GitHub.
 */
function build(): { commit: string; branch: string | null } | null {
  const sha = env(process.env.VERCEL_GIT_COMMIT_SHA, '')
  if (!sha) return null
  return { commit: sha.slice(0, 7), branch: env(process.env.VERCEL_GIT_COMMIT_REF, '') || null }
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
    build: build(),
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
