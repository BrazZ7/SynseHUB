import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { RAIZ, semComentarios } from './grafo-de-importacoes'

/**
 * ── Leitura de lista sem teto ───────────────────────────────────────────────
 *
 * O PostgREST corta a resposta no teto de linhas configurado no servidor, e
 * **não dá erro**: a resposta simplesmente vem menor. Toda leitura de lista
 * sem `.limit()` nem `.range()` aposta que o conjunto nunca vai encostar nesse
 * teto — e quando encosta, o sintoma não é uma tela quebrada, é uma tela
 * plausível com dado faltando.
 *
 * Três defeitos deste formato já custaram caro neste projeto:
 *
 *   `/avaliações`  ordenava os 100 primeiros alunos e chamava aquilo de fila
 *                  (0048);
 *   `/alunos`      mostrava "Última presença: —" para quem não aparecia há
 *                  meses, e a aba "Sumidos" listava quem treinou ontem (0049);
 *   a quilometragem da vida de um corredor era somada sobre uma leitura sem
 *                  teto, e vinha menor do que a pessoa correu (0050).
 *
 * ── O que este guarda faz ───────────────────────────────────────────────────
 *
 * Ele não exige teto em tudo: lista de planos de uma academia não vai passar de
 * mil, e paginar o que tem seis linhas é piorar o código por nada. O que ele
 * exige é **decisão registrada**. Cada leitura sem teto precisa estar numa das
 * três listas abaixo, com o motivo escrito. Método novo sem entrada falha, e
 * entrada que não corresponde mais a nada também — lista de dívida que não
 * encolhe sozinha vira decoração.
 *
 * A diferença entre as duas primeiras listas é a que importa na revisão:
 * `LIMITADA_PELO_DOMINIO` é "não precisa"; `PAGINACAO_PENDENTE` é "precisa e
 * não foi feito". A segunda é dívida com nome e endereço, não um comentário
 * perdido.
 *
 * Nenhuma das duas afirma qual é o teto deste servidor Supabase: ele não foi
 * conferido, e um guarda que depende de um número que ninguém viu mede
 * configuração em vez de efeito.
 */

const ARQUIVO = join(RAIZ, 'src/lib/database/supabase-data-source.ts')

/** O conjunto é limitado pelo próprio domínio: não há o que paginar. */
const LIMITADA_PELO_DOMINIO: Record<string, string> = {
  listStaff: 'a equipe de uma academia — dezenas, e a tela mostra todas de propósito',
  listPlans: 'os planos de uma academia — punhado',
  listCollectionRules: 'a régua de cobrança — punhado de etapas',
  listarSumidos: 'recorta por `.in(id, …)` com os ids da página: no máximo `pageSize`',
  listWorkoutExercises: 'os exercícios de uma ficha — dezenas',
  listAssignmentsForStudent: 'as fichas de um aluno — limitado pelo número de fichas da academia',
  listClassSchedules: 'a grade semanal — dezenas de horários',
  listClassSessions: 'recorta pela janela que a tela pede, e a agenda pede uma semana',
  listClassBookings: 'as reservas de **uma** aula — limitado pela lotação',
  listActiveWorkoutSessions:
    'os treinos abertos agora; a 0047 fecha os esquecidos, então não acumula',
  listPrograms: 'o catálogo de programas guiados — punhado',
  listNutritionPlans: 'as dietas de uma academia — dezenas',
  listNutritionPlansForStudent: 'as versões da dieta de um aluno — dezenas',
  montarPlano: 'as refeições de um plano — dezenas',
  listUserDevices: 'os aparelhos pareados de uma pessoa — punhado',
  listBodyShares: 'quem o aluno autorizou — punhado',
  listGymChallenges: 'os desafios de uma academia — um por ciclo, dezenas em anos',
  listGymChallengesForStudent: 'os desafios que um aluno entrou — dezenas',
  listChallengeEntries: 'uma inscrição por ciclo — dezenas em anos',
  listChallengeMedals: 'uma medalha por ciclo vencido — dezenas em anos',
  listStaffInvites: 'os convites pendentes — punhado',
  listConsents: 'os documentos de consentimento — punhado',
  listBaselineChallenges: 'o catálogo base, fixo',
  listLeadEvents: 'a linha do tempo de **um** lead — dezenas',
  getActivitySplits: 'um parcial por quilômetro — uma maratona tem 42',
  listPersonalRecords: 'um recorde por distância — punhado',
}

/**
 * Cresce sem fim, e um dia vai cortar. Dívida, não decisão.
 *
 * O conserto de cada uma não é só `.limit()`: um teto silencioso é o mesmo
 * defeito com outro número. É paginar com total à vista, como `/avaliações` e
 * a aba "Sumidos" fazem, ou mover a conta para o banco.
 */
const PAGINACAO_PENDENTE: Record<string, string> = {
  listOrganizations: 'a lista de academias da plataforma, em /synse-admin: cresce com o negócio',
  listExercises: 'a biblioteca Synse mais a da academia: cresce a cada exercício publicado',
  listWorkoutPlans: 'as fichas de uma academia: professores criam e não apagam',
  listAssignmentsForPlan: 'os alunos de uma ficha: pode ser a academia inteira',
  listAssessments: 'o histórico de avaliações de um aluno',
  listClassSessionsForStudent: 'o histórico de reservas de um aluno',
  listContent: 'o acervo de uma academia',
  listSynseContent: 'o acervo da Synse, que cresce com o catálogo',
  listRecipes: 'a biblioteca de receitas, que cresce com o catálogo',
}

/**
 * O caminho antigo, mantido só para a janela entre publicar e migrar.
 *
 * Publicar não é migrar: a Vercel publica no push, o SQL é colado à mão
 * depois. Nessa janela o código novo fala com o banco velho, e estas voltam a
 * fazer o que faziam — errado como sempre foi, mas de pé, porque devolver
 * coluna vazia ou número zerado mentiria mais do que a leitura que pode
 * cortar. Dar teto a elas seria mudar o comportamento que elas existem para
 * preservar.
 */
const CAMINHO_ANTIGO: Record<string, string> = {
  decoracaoPelaAplicacao: 'a decoração da lista de alunos como era antes da 0049',
  resumoPelaAplicacao: 'o resumo de corridas como era antes da 0050',
  countStudentsByPlan: 'o `comoEra` da contagem por plano, antes da 0050',
  countAssignments: 'o `comoEra` da contagem por ficha, antes da 0050',
  inadimplenciaPelaAplicacao: 'o resumo de inadimplência como era antes da 0051',
}

/**
 * As leituras de lista sem teto de um arquivo.
 *
 * Comentários saem primeiro, e não é detalhe: sem isso o bloco de documentação
 * de um método entra no corpo do **anterior**, e um `head: true` citado numa
 * frase isenta o método errado. Foi o que aconteceu na primeira versão desta
 * varredura — ela deixou de ver `countStudentsByPlan` porque o texto do método
 * seguinte falava de `count: 'exact', head: true`.
 */
export function leiturasSemTeto(codigo: string): string[] {
  const linhas = semComentarios(codigo).split('\n')

  const assinaturas: { nome: string; linha: number }[] = []
  linhas.forEach((linha, i) => {
    const achado =
      /^ {2}(?:private |protected |public )?(?:async )?([a-zA-Z_]\w*)\s*(?:<[^>]*>)?\(/.exec(linha)
    const reservadas = ['if', 'for', 'while', 'catch', 'switch', 'return', 'constructor']
    if (achado && !reservadas.includes(achado[1])) {
      assinaturas.push({ nome: achado[1], linha: i })
    }
  })

  const achadas: string[] = []
  assinaturas.forEach(({ nome, linha }, i) => {
    const fim = assinaturas[i + 1]?.linha ?? linhas.length
    const corpo = linhas.slice(linha, fim).join('\n')

    // `storage.from(bucket)` é arquivo, não tabela: não tem linha para cortar.
    const tabelas = corpo.replace(/storage\.from\(/g, 'STORAGE(')
    if (!/\.from\('/.test(tabelas)) return
    // Escrita devolve o que escreveu; o recorte é a cláusula, não o teto.
    if (/\.(insert|update|upsert|delete)\(/.test(corpo)) return
    if (/\.(limit|range|maybeSingle|single)\(/.test(corpo)) return
    // `{ count: 'exact', head: true }` conta no banco sem trazer linha.
    if (/head:\s*true/.test(corpo)) return

    achadas.push(nome)
  })

  return achadas
}

const codigo = readFileSync(ARQUIVO, 'utf8')
const declaradas = { ...LIMITADA_PELO_DOMINIO, ...PAGINACAO_PENDENTE, ...CAMINHO_ANTIGO }

describe('leitura de lista sem teto no data source', () => {
  it('toda leitura sem teto tem decisão registrada', () => {
    const semDecisao = leiturasSemTeto(codigo).filter((nome) => !(nome in declaradas))

    /*
     * Falhou? A leitura nova pode cortar em silêncio. Duas saídas: dar teto
     * com total à vista (como `/avaliações` e a aba "Sumidos") ou mover a conta
     * para o banco — e, se o conjunto for limitado pelo domínio, declarar isso
     * em `LIMITADA_PELO_DOMINIO` com o motivo.
     */
    expect(semDecisao).toEqual([])
  })

  it('nenhuma entrada ficou para trás', () => {
    const existem = new Set(leiturasSemTeto(codigo))
    const fantasmas = Object.keys(declaradas).filter((nome) => !existem.has(nome))

    // O método ganhou teto, foi renomeado ou saiu: a entrada sai com ele.
    // Lista de dívida que não encolhe sozinha vira decoração.
    expect(fantasmas).toEqual([])
  })

  it('um nome não aparece em duas listas', () => {
    const todas = [
      ...Object.keys(LIMITADA_PELO_DOMINIO),
      ...Object.keys(PAGINACAO_PENDENTE),
      ...Object.keys(CAMINHO_ANTIGO),
    ]
    expect(todas).toHaveLength(new Set(todas).size)
  })

  it('cada entrada diz o motivo, e não só o nome', () => {
    /*
     * "porque sim" não é motivo. A frase é o que o próximo leitor tem para
     * decidir se a classificação ainda vale — e a dívida só é dívida se
     * alguém puder conferir o endereço dela.
     */
    const mudas = Object.entries(declaradas)
      .filter(([, motivo]) => motivo.trim().length < 15)
      .map(([nome]) => nome)

    expect(mudas).toEqual([])
  })

  it('a dívida conhecida é esta, e não cresceu sem alguém decidir', () => {
    // O número no teste existe para a próxima adição exigir uma linha a mais
    // aqui — que é onde a conversa sobre paginar acontece. E para a lista
    // encolher **de propósito**: foi 15 com `listLeads` dentro, 14 com
    // `getChargesForStudent`, 13 com `listWorkoutLogs`, 12 com
    // `listOverdueCharges`, e 11 com as duas leituras de pesagem.
    expect(Object.keys(PAGINACAO_PENDENTE)).toHaveLength(9)
  })
})

describe('o guarda enxerga o que diz enxergar', () => {
  /*
   * Os controles. Sem eles este arquivo é um teste que passa porque não olha
   * nada — e já aconteceu neste projeto: o guarda de constante de módulo
   * cliente tinha a mesma falha que guardava, e por isso não viu a própria
   * isca.
   */
  const comMetodo = (corpo: string) => `class X {\n${corpo}\n}\n`

  it('pega uma leitura de lista nova sem teto', () => {
    const isca = comMetodo(`  async listCoisas(orgId: string) {
    return this.client.from('coisas').select('*').eq('organization_id', orgId)
  }`)
    expect(leiturasSemTeto(isca)).toEqual(['listCoisas'])
  })

  it('não acusa quem tem teto', () => {
    for (const recorte of ['.limit(50)', '.range(0, 49)', '.maybeSingle()', '.single()']) {
      const corpo = comMetodo(`  async leCoisa(orgId: string) {
    return this.client.from('coisas').select('*').eq('organization_id', orgId)${recorte}
  }`)
      expect(leiturasSemTeto(corpo)).toEqual([])
    }
  })

  it('não acusa contagem feita no banco', () => {
    const corpo = comMetodo(`  async contaCoisas(orgId: string) {
    return this.client
      .from('coisas')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
  }`)
    expect(leiturasSemTeto(corpo)).toEqual([])
  })

  it('não acusa escrita, nem arquivo no storage', () => {
    const escrita = comMetodo(`  async salvaCoisa(orgId: string) {
    return this.client.from('coisas').insert({ organization_id: orgId }).select('*')
  }`)
    expect(leiturasSemTeto(escrita)).toEqual([])

    const arquivo = comMetodo(`  async listaArquivos() {
    return this.client.storage.from('avatars').list()
  }`)
    expect(leiturasSemTeto(arquivo)).toEqual([])
  })

  it('não deixa o comentário de um método isentar o anterior', () => {
    /*
     * A isca exata do defeito que esta varredura teve: `listCoisas` não tem
     * teto, e o bloco de documentação **do método seguinte** menciona
     * `head: true`. Sem tirar comentário antes de repartir, aquele texto conta
     * como corpo de `listCoisas` e ela escapa.
     */
    const isca = comMetodo(`  async listCoisas(orgId: string) {
    return this.client.from('coisas').select('*').eq('organization_id', orgId)
  }

  /**
   * Conta no banco com \`{ count: 'exact', head: true }\`.
   */
  async contaCoisas(orgId: string) {
    return this.client.from('coisas').select('id', { count: 'exact', head: true }).eq('organization_id', orgId)
  }`)
    expect(leiturasSemTeto(isca)).toEqual(['listCoisas'])
  })
})
