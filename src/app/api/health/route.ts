import { NextResponse } from 'next/server'

import { APP, LEGAL } from '@/config/app'
import { SUPABASE_ANON_KEY, SUPABASE_URL, isDemoMode } from '@/lib/database/env'
import { getPaymentProvider, provedorConfigurado, provedorDesconhecido } from '@/lib/payments'
import { diagnosticoDoPush } from '@/lib/push/env'
import {
  diagnosticoDoMercadoPago,
  type DiagnosticoMercadoPago,
} from '@/lib/payments/providers/mercadopago/env'
import { env } from '@/lib/env'
import { vereditoDeFuncao, vereditoDeRecurso, type SchemaProbe } from '@/lib/health/probe-verdict'
import { rateLimitCompartilhado } from '@/lib/rate-limit'
import { sondarUpstash } from '@/lib/rate-limit/upstash'

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
  '0036_assinatura_plus.sql',
  '0037_amigos.sql',
  '0038_cadeado_do_plus.sql',
  '0039_acervo_synse.sql',
  '0040_push.sql',
  '0041_vitrine_do_cadeado.sql',
  '0042_vitrine_nao_anuncia_a_quem_ja_le.sql',
  '0043_programas_guiados.sql',
  '0044_biblioteca_de_receitas.sql',
  '0045_quem_o_aluno_pode_autorizar.sql',
  '0046_fechando_a_auditoria.sql',
  '0047_treino_fantasma.sql',
  '0048_fila_de_avaliacao.sql',
  '0049_alunos_sem_corte.sql',
  '0050_numero_derivado_no_banco.sql',
  '0051_inadimplencia_sem_corte.sql',
  '0052_serie_de_peso.sql',
  /*
   * A 0053 não ganha sonda de schema, e isto é deliberado.
   *
   * Ela só substitui o corpo de `record_body_measurement` — a assinatura é a
   * mesma antes e depois. Uma `rpcCheck` responderia 401 nos dois casos, então
   * a sonda diria "presente" para um banco que não migrou: afirmação falsa,
   * pior que ausência de sonda. Quem responde se ela subiu é `schema_migrations`,
   * e é por isso que a última linha de toda migration se registra lá.
   */
  '0053_reimportar_saude.sql',
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
    assinaturaPlus,
    escritaDaAssinatura,
    amigos,
    rankingDeAmigos,
    cadeadoDoPlus,
    acervoSynse,
    avisoPush,
    vitrineDoCadeado,
    programasGuiados,
    bibliotecaDeReceitas,
    autorizarOCorpo,
    auditoriaFechada,
    filaDeAvaliacao,
    listaDeAlunosSemCorte,
    numeroDerivadoNoBanco,
    inadimplenciaSemCorte,
    serieDePeso,
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
    /*
     * Assinatura Synse+ (0036). Duas sondas, como no Synse Body: a coluna sem
     * a função seria pior do que nenhuma das duas — o app leria o estado da
     * assinatura e nada teria como escrevê-lo, então toda conta ficaria FREE
     * para sempre, em silêncio.
     */
    schemaCheck('user_profiles?select=plus_status&limit=1'),
    /*
     * `set_plus_subscription` é negada ao anônimo por `revoke`, então 401/403
     * é "existe" e 404 é "não existe" — e o POST não chega a executar, que é
     * o que torna seguro sondar uma função que muda plano pago.
     */
    rpcCheck('set_plus_subscription', {
      p_profile_id: '00000000-0000-0000-0000-000000000000',
      p_status: 'NONE',
    }),
    /*
     * Amigos (0037). Aqui a sonda **não** é de tabela, e o motivo vale o
     * comentário: ler `friendships` com a chave pública responde 401
     * "permission denied for function is_friendship_party" — a política de
     * select chama esse ajudante, e a 0037 o revoga do anônimo. Não é falta de
     * grant na tabela: o Supabase concede, e quem barra é a função.
     *
     * Dá para fazer a sonda ler 200 concedendo o ajudante ao anônimo. Seria
     * afrouxar o schema para agradar o termômetro, e a escolha é a outra:
     * sondar `list_friends`, que é revogada por projeto — 401/403 é "existe",
     * 404 é "não existe".
     */
    rpcCheck('list_friends', {}),
    /*
     * São duas porque a lista sem o ranking abriria a tela de amigos
     * funcionando pela metade, com o ranking vazio para sempre — e vazio ali
     * parece "ninguém autorizou" em vez de "faltou migration".
     *
     * `friends_ranking` é `security definer` e revogada do anônimo, então
     * 401/403 é "existe" e 404 é "não existe". Sem `executa`, de propósito:
     * aqui um 200 não seria confirmação, seria a notícia de que o anônimo
     * consegue somar treino dos outros.
     */
    rpcCheck('friends_ranking', {
      p_from: '2000-01-01T00:00:00Z',
      p_to: '2000-01-02T00:00:00Z',
    }),
    /*
     * O cadeado do Synse+ (0038). Sem ele, as políticas de conteúdo continuam
     * conferindo `consumer_subscriptions` — a tabela em que nada escreve — e
     * assinante em dia não vê o que pagou. A sonda existe porque esse sintoma
     * só apareceria no dia do primeiro e-book, e chegaria como reclamação.
     *
     * `executa: true` porque `tem_synse_plus` é `stable`, só lê, e é concedida
     * ao anônimo de propósito: para ele devolve `false`. Aqui 200 é a
     * confirmação.
     */
    rpcCheck('tem_synse_plus', {}, { executa: true }),
    /*
     * A porta do acervo (0039). Sem ela não há como criar conteúdo de
     * plataforma — a política de escrita exige dono desde a 0004 —, e a tela
     * do acervo abriria oferecendo um formulário que o banco recusa.
     *
     * `save_synse_content` é revogada do anônimo, então 401/403 é "existe" e
     * 404 é "não existe". Sem `executa`, e aqui isso não é detalhe: ligá-lo
     * faria a sonda **publicar** a cada visita ao endereço de saúde.
     */
    rpcCheck('save_synse_content', {
      p_id: null,
      p_type: 'ARTICLE',
      p_title: 'sonda',
    }),
    /*
     * A inscrição de push (0040). Sem ela o cartão de avisos grava no vazio e
     * a pessoa fica com "ligado" na tela sem nunca receber nada.
     *
     * `register_push_subscription` é revogada do anônimo, então 401/403 é
     * "existe" e 404 é "não existe". Sem `executa`, e aqui não é detalhe:
     * ligá-lo faria a sonda **inscrever um aparelho fantasma** a cada visita.
     */
    rpcCheck('register_push_subscription', {
      p_endpoint: 'sonda',
      p_p256dh: 'sonda',
      p_auth: 'sonda',
    }),
    /*
     * A vitrine do cadeado (0041). Sem ela a tela de conteúdos abre sem a
     * prateleira do Synse+ — e falha calada, porque a leitura devolve lista
     * vazia de propósito para não derrubar a tela. É o tipo de ausência que
     * ninguém percebe olhando: a tela funciona, só não vende.
     *
     * `executa: true` porque `acervo_trancado` é `stable`, só lê, e é
     * concedida ao anônimo por decisão de produto — vitrine serve para ser
     * vista antes de entrar. Aqui 200 é a confirmação, e o que ela devolve ao
     * anônimo é o que qualquer visitante veria: título e resumo, nunca o
     * conteúdo.
     */
    rpcCheck('acervo_trancado', { p_id: null }, { executa: true }),
    /*
     * Os programas guiados (0043). Sem ela a tela de programas abre vazia e
     * a leitura falha calada, porque ela tolera a migration ausente de
     * propósito — o tipo de ausência que ninguém percebe olhando a tela.
     *
     * `iniciar_programa` é revogada do anônimo, então 401/403 é "existe" e
     * 404 é "não existe". Sem `executa`, e aqui não é detalhe: ligá-lo faria
     * a sonda **matricular alguém** a cada visita ao endereço de saúde.
     */
    rpcCheck('iniciar_programa', { p_program_id: '00000000-0000-0000-0000-000000000000' }),
    /*
     * A biblioteca de receitas (0044). Sem ela a tela de receitas abre vazia
     * para quem não assina, e cala: a leitura tolera a migration ausente de
     * propósito.
     *
     * `executa: true` pela mesma razão de `acervo_trancado`:
     * `receitas_trancadas` é `stable`, só lê, e é concedida ao anônimo porque
     * vitrine serve para ser vista antes de entrar. O que ela devolve é o que
     * qualquer visitante veria — título, foto e tempo de preparo, nunca os
     * ingredientes nem o preparo.
     */
    rpcCheck('receitas_trancadas', {}, { executa: true }),
    /*
     * O compartilhamento do corpo (0045). Sem ela a tela de
     * `/app/corpo/compartilhamento` não tem a quem oferecer, e a pessoa perde
     * o controle sobre quem vê o dado de saúde dela.
     *
     * Sem `executa`, e aqui não é detalhe: ligá-lo faria a sonda
     * **autorizar alguém** a ver dado corporal a cada visita ao endereço de
     * saúde. `autorizar_corpo` é revogada do anônimo, então 401/403 é
     * "existe" e 404 é "não existe".
     */
    rpcCheck('autorizar_corpo', { p_perfil: '00000000-0000-0000-0000-000000000000' }),
    /*
     * A 0046 fecha nove furos achados em auditoria, e o mais grave deles é a
     * auto-promoção a conta de plataforma. Enquanto ela não estiver aplicada,
     * **qualquer dona de academia vira super admin com um `update`** — por
     * isso esta sonda importa mais que as outras.
     *
     * Sonda `revogar_corpo` e não `health_organization_ids`, e a primeira
     * escolha estava errada: `health_organization_ids` é concedida ao anônimo
     * de propósito — ela é chamada de dentro da política de `assessments`, e
     * revogá-la do anônimo trocaria "nenhuma linha" por `permission denied`
     * na leitura pública, que é a armadilha que a 0008 documenta. Concedida,
     * ela responde 200, e sem `executa` o veredito é `null`: sonda que não
     * diz nada, igual a não ter sonda.
     *
     * `revogar_corpo` é revogada do anônimo, então 401/403 é "existe" e 404 é
     * "não existe". Sem `executa`, e aqui não é detalhe: ela **revoga uma
     * autorização**, e ligá-lo faria a sonda escrever a cada visita.
     */
    rpcCheck('revogar_corpo', { p_share_id: '00000000-0000-0000-0000-000000000000' }),
    /*
     * A 0048 ordena a fila de avaliação no banco. Sem ela a tela volta a
     * ordenar os 100 primeiros do alfabeto e a chamar aquilo de fila — quem
     * ficar de fora some, inclusive quem nunca foi avaliado.
     *
     * `fila_de_avaliacao` é revogada do anônimo, então 401/403 é "existe" e
     * 404 é "não existe". Sem `executa`: ela é `security invoker`, e chamada
     * pelo anônimo não leria nada de qualquer forma — mas a sonda não precisa
     * executar para saber se existe, e executar o que não precisa é o que
     * transformou a sonda da 0046 numa que escrevia.
     */
    rpcCheck('fila_de_avaliacao', {
      p_organization_id: '00000000-0000-0000-0000-000000000000',
      p_limit: 1,
      p_offset: 0,
    }),

    /*
     * A 0049 — a decoração da lista de alunos e a aba "Sumidos".
     *
     * Sem ela `decorateStudents` volta a ler `charges` e `check_ins` sem teto,
     * e o PostgREST corta a resposta sem dizer: o aluno que não aparece há
     * meses chega à tela com "Última presença: —", e a aba que existe para
     * telefonar para quem parou de vir passa a listar quem treinou ontem. É um
     * defeito que a tela não denuncia, então a sonda precisa.
     *
     * `decoracao_dos_alunos` e `alunos_dormentes` entram na mesma migration;
     * sondar a primeira basta, porque o registro é a última linha do arquivo.
     */
    rpcCheck('decoracao_dos_alunos', {
      p_organization_id: '00000000-0000-0000-0000-000000000000',
      p_student_ids: [],
    }),

    /*
     * A 0050 — contagem e soma feitas pelo banco.
     *
     * Sem ela as três voltam a contar sobre uma leitura sem teto, e o sintoma
     * é um número menor que o verdadeiro: "34 alunos" num plano de 120, ou
     * 180 km em quem correu 400. Número errado com cara de certo não aparece
     * na tela como defeito, então a sonda precisa.
     *
     * As três entram na mesma migration; sondar uma basta, porque o registro
     * é a última linha do arquivo.
     */
    rpcCheck('alunos_por_plano', {
      p_organization_id: '00000000-0000-0000-0000-000000000000',
    }),

    /*
     * A 0051 — o resumo de inadimplência contado no banco.
     *
     * Sem ela a tela volta a somar cinco números sobre a lista inteira de
     * cobranças vencidas, lida sem teto — e cobrança vencida é o conjunto que
     * mais cresce sem ninguém apagar. Os cinco vêm **menores**: a academia vê
     * menos dinheiro a receber do que tem, e não há nada na tela dizendo que
     * falta linha. A sonda existe porque o defeito é mudo e caro.
     */
    rpcCheck('resumo_de_inadimplencia', {
      p_organization_id: '00000000-0000-0000-0000-000000000000',
      p_hoje: '2000-01-01',
      p_cortes: [1],
    }),

    /*
     * A 0052 — a série do gráfico de peso agrupada no banco.
     *
     * Sem ela o gráfico volta a sair de uma leitura crua. O caminho antigo tem
     * teto escrito, então não há corte silencioso — mas há corte: quem tem
     * mais de mil pesagens na janela perde o começo da linha, e um gráfico que
     * nasce tarde não parece defeito nenhum na tela. A sonda avisa.
     */
    rpcCheck('serie_de_peso', {
      p_user_profile_id: '00000000-0000-0000-0000-000000000000',
      p_desde: null,
      p_balde: 'day',
    }),
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
    if (
      (assinaturaPlus.present === false || escritaDaAssinatura.present === false) &&
      !faltando.includes('0036_assinatura_plus.sql')
    ) {
      faltando.push('0036_assinatura_plus.sql')
    }
    /*
     * A 0049 só cria funções, e função some mais fácil que tabela: um
     * `drop function` solto, ou um banco restaurado de backup anterior a ela,
     * deixa o registro intacto e a lista de alunos mentindo em silêncio.
     */
    if (
      listaDeAlunosSemCorte.present === false &&
      !faltando.includes('0049_alunos_sem_corte.sql')
    ) {
      faltando.push('0049_alunos_sem_corte.sql')
    }
    if (
      numeroDerivadoNoBanco.present === false &&
      !faltando.includes('0050_numero_derivado_no_banco.sql')
    ) {
      faltando.push('0050_numero_derivado_no_banco.sql')
    }
    if (
      inadimplenciaSemCorte.present === false &&
      !faltando.includes('0051_inadimplencia_sem_corte.sql')
    ) {
      faltando.push('0051_inadimplencia_sem_corte.sql')
    }
    if (serieDePeso.present === false && !faltando.includes('0052_serie_de_peso.sql')) {
      faltando.push('0052_serie_de_peso.sql')
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
      assinaturaPlus,
      escritaDaAssinatura,
      amigos,
      rankingDeAmigos,
      cadeadoDoPlus,
      acervoSynse,
      avisoPush,
      vitrineDoCadeado,
      programasGuiados,
      bibliotecaDeReceitas,
      autorizarOCorpo,
      auditoriaFechada,
      filaDeAvaliacao,
      listaDeAlunosSemCorte,
      numeroDerivadoNoBanco,
      inadimplenciaSemCorte,
      serieDePeso,
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
    '0036_assinatura_plus.sql',
    '0037_amigos.sql',
    '0038_cadeado_do_plus.sql',
    '0039_acervo_synse.sql',
    '0040_push.sql',
    '0041_vitrine_do_cadeado.sql',
    '0042_vitrine_nao_anuncia_a_quem_ja_le.sql',
    '0043_programas_guiados.sql',
    '0044_biblioteca_de_receitas.sql',
    '0045_quem_o_aluno_pode_autorizar.sql',
    '0046_fechando_a_auditoria.sql',
    '0047_treino_fantasma.sql',
    '0048_fila_de_avaliacao.sql',
    '0049_alunos_sem_corte.sql',
    '0050_numero_derivado_no_banco.sql',
    '0051_inadimplencia_sem_corte.sql',
    '0052_serie_de_peso.sql',
    '0053_reimportar_saude.sql',
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
    assinaturaPlus,
    escritaDaAssinatura,
    amigos,
    rankingDeAmigos,
    cadeadoDoPlus,
    acervoSynse,
    avisoPush,
    vitrineDoCadeado,
    programasGuiados,
    bibliotecaDeReceitas,
    autorizarOCorpo,
    auditoriaFechada,
    filaDeAvaliacao,
    listaDeAlunosSemCorte,
    numeroDerivadoNoBanco,
    inadimplenciaSemCorte,
    serieDePeso,
    pendingMigrations: pendentes,
  }
}

/**
 * O que a configuração pede, e o que está em uso.
 *
 * Os dois lados, e não só um, porque é justamente a diferença que interessa.
 * `PAYMENT_PROVIDER=asaas` continua no ambiente depois de o adapter ter sido
 * removido, e a fábrica cai no simulado — a aplicação continua de pé, e sem
 * isto aqui ninguém saberia que a cobrança real está desligada olhando o
 * endereço. Uma sonda que responde só "mock" esconde o desencontro; esta
 * mostra.
 *
 * `pedido` é nome de configuração, não segredo, e nunca foi chave nenhuma.
 */
function paymentConfiguration(): {
  pedido: string | null
  emUso: string
  desconhecido: boolean
  marketplace: boolean
  mercadoPago?: DiagnosticoMercadoPago
} {
  const pedido = provedorConfigurado()
  const provider = getPaymentProvider()
  const diagnostico = diagnosticoDoMercadoPago()

  return {
    pedido: pedido || null,
    emUso: provider.id,
    desconhecido: provedorDesconhecido() !== null,
    /*
     * Este provedor cobra em nome da academia? Hoje só o simulado — e saber
     * disso pela sonda evita a conclusão de que a mensalidade "parou de
     * funcionar" quando na verdade ela nunca ligou com este provedor.
     */
    marketplace: provider.suportaMarketplace,
    /*
     * ── Por que não é só quando `pedido` bate ─────────────────────────────
     *
     * A primeira versão só mostrava este bloco com `PAYMENT_PROVIDER=mercadopago`,
     * e isso cegou a sonda no momento exato em que ela era necessária:
     * configuração pela metade na Vercel respondeu `pedido: null`, `emUso:
     * mock`, e nada dizia se as credenciais tinham chegado ou não. Ficaram
     * três suspeitas e nenhuma forma de separá-las.
     *
     * Agora basta **qualquer** das três variáveis existir para o bloco
     * aparecer. Quem está diagnosticando precisa ver qual das três faltou, e
     * esconder duas porque a terceira está ausente é esconder a resposta.
     *
     * O estado que mais importa continua sendo token sem segredo de webhook:
     * a assinatura é criada, a pessoa paga, e a confirmação nunca chega
     * porque todo aviso é recusado. Dinheiro sai da conta dela e o Synse+
     * não liga, sem nada na tela denunciando.
     */
    ...(pedido === 'mercadopago' ||
    diagnostico.token === 'ok' ||
    diagnostico.segredoDoWebhook === 'ok'
      ? { mercadoPago: diagnostico }
      : {}),
  }
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
    /**
     * O limite por minuto vale para todas as instâncias, ou só para uma?
     *
     * Falso aqui não quebra tela nenhuma, e é justamente por isso que precisa
     * aparecer: a contagem em memória na Vercel faz "cinco por minuto" virar
     * cinco **por instância**, e o limite real vira um múltiplo que varia com
     * o tráfego. O sintoma é não ter sintoma.
     *
     * **Verdadeiro aqui significa "as duas variáveis estão preenchidas", e
     * nada além disso.** Para saber se o Redis responde — e se o token tem
     * escrita, que é o que o limitador precisa —, veja `rateLimit` em
     * `?deep=1`. Confundir os dois é o que me fez publicar um campo que
     * media a configuração achando que media o efeito.
     */
    rateLimitCompartilhado: rateLimitCompartilhado(),
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
      ? {
          databaseAuth: await databaseReachable(),
          schema: await schemaReadiness(),
          /*
           * O estado das chaves de push, sem nenhum valor.
           *
           * Fica atrás de `?deep=1` como as outras verificações caras, e existe
           * porque a alternativa era alguém entrar no app, abrir a gaveta da
           * conta e procurar um cartão para responder "as chaves chegaram?".
           */
          push: await diagnosticoDoPush(),
        }
      : {}),
    /*
     * ── O Redis responde, ou só a variável está preenchida? ────────────────
     *
     * `configuracao.rateLimitCompartilhado` diz a segunda coisa, e por um
     * tempo eu publiquei isso como se fosse a primeira. Token errado, token
     * **somente-leitura** — o painel do Upstash oferece os dois — ou banco
     * apagado passam como configurado, e aí todo pedido cai para a memória
     * sem nada denunciar. É o defeito que o campo existe para pegar,
     * acontecendo dentro do campo.
     *
     * Esta sonda escreve pelo mesmo caminho do limitador, então o que ela
     * aprova é o que o produto usa.
     *
     * Fora do `!demo`, ao contrário das sondas de schema: o limitador não
     * tem nada a ver com o Supabase. Pô-la lá dentro escondia a resposta
     * justamente de quem está conferindo a configuração num ambiente sem
     * banco — foi onde eu a pus primeiro, e só vi porque fui olhar a saída.
     */
    ...(deep ? { rateLimit: await sondarUpstash() } : {}),
    paymentProvider: paymentConfiguration(),
    timestamp: new Date().toISOString(),
  })
}
