import { NextResponse } from 'next/server'

import { APP, LEGAL } from '@/config/app'
import { SUPABASE_ANON_KEY, SUPABASE_URL, isDemoMode } from '@/lib/database/env'
import { getPaymentProvider } from '@/lib/payments'
import { env } from '@/lib/env'
import {
  vereditoDeFuncao,
  vereditoDeRecurso,
  type SchemaProbe,
} from '@/lib/health/probe-verdict'

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
async function schemaCheck(recurso: string): Promise<SchemaProbe> {
  try {
    const resposta = await fetch(`${SUPABASE_URL}/rest/v1/${recurso}`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    })
    return vereditoDeRecurso(resposta.status)
  } catch {
    // Rede caída não é schema faltando, e dizer que falta mandaria alguém
    // colar SQL que já está no banco.
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
 *
 * O veredito — inclusive a opção `executa`, para a função que o anônimo pode
 * chamar — mora em `lib/health/probe-verdict`, que é onde ele é testado.
 */
async function rpcCheck(
  nome: string,
  corpo: Record<string, unknown>,
  opcoes: { executa?: boolean } = {},
): Promise<SchemaProbe> {
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

    return vereditoDeFuncao(resposta.status, opcoes)
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
  '0019_mensalidade_automatica.sql',
  '0020_convite_de_equipe.sql',
  '0021_biblioteca_de_exercicios.sql',
  '0022_encerrar_conta.sql',
  '0023_avaliacao_fisica.sql',
  '0024_agenda.sql',
  '0025_agenda_autorizacao.sql',
  '0026_treino_ativo.sql',
  '0027_relatorios.sql',
  '0028_crm.sql',
  '0029_desafios_da_academia.sql',
  '0030_nutricao.sql',
  '0031_conteudos.sql',
  '0032_synse_body.sql',
  '0033_foto_de_perfil.sql',
  '0034_super_admin.sql',
  '0035_aderencia.sql',
]

async function schemaReadiness() {
  const [
    tier,
    desafios,
    profissional,
    entradaSemVinculo,
    corridas,
    consentimento,
    avaliacaoFisica,
    agendaAutossuficiente,
    synseBody,
    escritaDoCorpo,
    aderencia,
  ] = await Promise.all([
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
    /*
     * `body_density` só existe depois da 0023. A RLS nega a linha e devolve
     * lista vazia; o que a sonda lê é o schema ter aceitado a pergunta. O
     * registro de migrations já diria que a 0023 rodou — esta sonda responde
     * outra pergunta: a coluna continua lá.
     */
    schemaCheck('assessments?select=body_density&limit=1'),
    /*
     * A 0024 saiu em duas versões antes de chegar a produção, e as duas
     * registram a mesma linha em `schema_migrations` — o registro diz que rodou,
     * não qual rodou. Foi assim que um banco ficou com a versão que deixava uma
     * academia reservar em nome de aluno de outra, com o registro em dia.
     *
     * `ensure_org_class_sessions` só existe depois da 0025. A função é negada ao
     * anônimo, então 401/403 é "existe" e 404 é "o reparo ainda não foi colado".
     */
    rpcCheck('ensure_org_class_sessions', {
      p_organization_id: '00000000-0000-0000-0000-000000000000',
      p_days_ahead: 21,
    }),
    /*
     * Synse Body. `body_measurements` só existe depois da 0032, e a RLS nega
     * toda linha ao anônimo — o que a sonda lê é o schema ter aceitado a
     * pergunta, não o conteúdo.
     */
    schemaCheck('body_measurements?select=id&limit=1'),
    /*
     * A tabela sem a função seria pior do que nenhuma das duas: a tela abriria
     * e a pesagem falharia na hora de gravar. `record_body_measurement` é
     * negada ao anônimo por `revoke`, então 401/403 é "existe" e 404 é "não
     * existe" — e o POST não grava nada, porque o anônimo não pode executá-la.
     */
    rpcCheck('record_body_measurement', {
      p_client_id: 'sonda',
      p_measured_at: '2000-01-01T00:00:00Z',
      p_source: 'MANUAL',
    }),
    /*
     * Aderência (0035). A coluna `reps_planned` existe desde a 0026 e a função
     * que a lê é nova — o registro de migrations diria que a 0035 rodou, e esta
     * sonda responde a outra pergunta: a função continua lá.
     *
     * Ao contrário das duas acima, esta não é revogada: é `security invoker` e
     * `stable`, então o anônimo executa e a RLS devolve lista vazia. Por isso
     * `executa: true` — aqui 200 é a confirmação. O aluno inexistente no
     * parâmetro é cinto e suspensório: mesmo sem RLS não haveria linha.
     */
    rpcCheck(
      'workout_adherence',
      {
        p_student_id: '00000000-0000-0000-0000-000000000000',
        p_from: '2000-01-01T00:00:00Z',
        p_to: '2000-01-02T00:00:00Z',
      },
      { executa: true },
    ),
  ])

  const registradas = await migracoesRegistradas()

  /*
   * Com o registro no ar, ele manda: é a única fonte que enxerga migration sem
   * forma própria, como a 0018. Sem ele, valem as sondas de formato — que é
   * como funcionava até a 0018 existir.
   */
  if (registradas) {
    const faltando = MIGRATIONS_ESPERADAS.filter((versao) => !registradas.includes(versao))
    /*
     * O registro guarda o que rodou, não o que continua no banco. Coluna que
     * sumiu por outro caminho — restauração de backup, edição à mão — deixa o
     * registro intacto e a tela quebrada; quem percebe é a sonda de formato.
     */
    if (avaliacaoFisica.present === false && !faltando.includes('0023_avaliacao_fisica.sql')) {
      faltando.push('0023_avaliacao_fisica.sql')
    }
    if (
      agendaAutossuficiente.present === false &&
      !faltando.includes('0025_agenda_autorizacao.sql')
    ) {
      faltando.push('0025_agenda_autorizacao.sql')
    }
    /*
     * As duas sondas do Synse Body, pelo mesmo motivo das de cima: o registro
     * guarda que a 0032 rodou, e não que a tabela e a função continuam lá.
     */
    if (
      (synseBody.present === false || escritaDoCorpo.present === false) &&
      !faltando.includes('0032_synse_body.sql')
    ) {
      faltando.push('0032_synse_body.sql')
    }
    if (aderencia.present === false && !faltando.includes('0035_aderencia.sql')) {
      faltando.push('0035_aderencia.sql')
    }
    return {
      synseRun: corridas,
      entradaSemVinculo,
      userProfilesTier: tier,
      baselineChallenges: desafios,
      professionalPlan: profissional,
      consentimento,
      avaliacaoFisica,
      agendaAutossuficiente,
      synseBody,
      escritaDoCorpo,
      aderencia,
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
  // Sem `schema_migrations`, a 0018 não subiu — ela é quem cria a tabela — e a
  // 0019, que vem depois, também não.
  pendentes.push(
    '0018_reativacao_avisa.sql',
    '0019_mensalidade_automatica.sql',
    '0020_convite_de_equipe.sql',
    '0021_biblioteca_de_exercicios.sql',
    '0022_encerrar_conta.sql',
    '0023_avaliacao_fisica.sql',
    '0024_agenda.sql',
    '0025_agenda_autorizacao.sql',
    '0026_treino_ativo.sql',
    '0027_relatorios.sql',
    '0028_crm.sql',
    '0029_desafios_da_academia.sql',
    '0030_nutricao.sql',
    '0031_conteudos.sql',
    '0032_synse_body.sql',
    '0033_foto_de_perfil.sql',
    '0034_super_admin.sql',
    '0035_aderencia.sql',
  )

  return {
    synseRun: corridas,
    entradaSemVinculo,
    userProfilesTier: tier,
    baselineChallenges: desafios,
    professionalPlan: profissional,
    consentimento,
    avaliacaoFisica,
    agendaAutossuficiente,
    synseBody,
    escritaDoCorpo,
    aderencia,
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

/**
 * As variáveis que precisam existir, e se existem.
 *
 * Só o fato, nunca o valor. Existe porque esquecer uma variável de ambiente
 * não denuncia nada na tela: sem `CRON_SECRET`, a rotina de cobrança recusa
 * toda chamada e devolve 404 — o mesmo 404 de quem não deveria estar lá — e
 * nenhuma mensalidade é gerada em silêncio. Descobrir isso pela reclamação da
 * academia, no dia 5, é caro demais para uma informação que cabe num booleano.
 *
 * Dizer que o segredo está configurado não ajuda quem não o tem: sem o valor,
 * a resposta continua sendo 404.
 */
function configuracao() {
  return {
    /** A rotina diária de cobrança consegue rodar? */
    cobrancaAgendada: Boolean(env(process.env.CRON_SECRET, '')),
    /** Termos e privacidade mostram o controlador, ou "em constituição"? */
    identificacaoLegal: Boolean(LEGAL.entity && LEGAL.taxId),
    /** Os azulejos do mapa vêm de fornecedor contratado ou do servidor público? */
    mapaProprio: Boolean(env(process.env.NEXT_PUBLIC_MAP_TILE_URL, '')),
    /** E o estilo declarado, que decide se o app repinta o mapa ou não. */
    mapaEstilo: env(process.env.NEXT_PUBLIC_MAP_TILE_STYLE, '') || 'raw',
  }
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
    configuracao: configuracao(),
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
