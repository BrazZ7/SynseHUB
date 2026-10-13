import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { RAIZ, semComentarios } from './grafo-de-importacoes'

/**
 * ── Tabela que o produto lê e ninguém escreve ───────────────────────────────
 *
 * Este guarda nasceu de um defeito que custou caro e era completamente mudo.
 *
 * `workout_logs` existe desde a 0003 e **nenhuma linha do produto escrevia
 * nela**: o treino entra em `workout_set_logs` pela 0026. Quatro coisas liam a
 * tabela antiga — "Carga atual", "Ganho de carga", "Treinos registrados" e dois
 * gráficos de evolução. Em academia real os quatro eram `—`, `—`, `0` e uma
 * linha que nunca aparecia, **para sempre**, por mais que o aluno treinasse.
 *
 * O que fez o defeito sobreviver tanto tempo: a semente da demonstração
 * preenche `workout_logs`. Então tudo funcionava exatamente onde o produto é
 * olhado, e falhava exatamente onde ele é usado. Não há erro, não há log, não
 * há tela quebrada — há uma tela plausível com número que nunca chega.
 *
 * `collection_rules` tinha a mesma forma, e pior: o cartão "Régua de cobrança"
 * listava três avisos marcados "Ativa" ao lado dos números de dinheiro, e nada
 * no produto lê essa tabela para enviar coisa alguma.
 *
 * ── O que este teste exige ──────────────────────────────────────────────────
 *
 * Toda tabela lida pelo data source precisa ter um escritor **ou** estar
 * declarada abaixo com o motivo. Escritor conta: `insert`/`update`/`delete`
 * pelo PostgREST, dentro de uma função do banco que a aplicação chame, dentro
 * de um gatilho, ou um `insert` de semente numa migration.
 */

const MIGRATIONS = join(RAIZ, 'src/db/migrations')
const DATA_SOURCE = join(RAIZ, 'src/lib/database/supabase-data-source.ts')

/**
 * Lida sem escritor **porque a funcionalidade não existe ainda**, e a tela diz
 * isso em voz alta. Entrada aqui é dívida com data, não decisão.
 */
const ESPERANDO_FUNCIONALIDADE: Record<string, string> = {
  payment_accounts:
    'a subconta da academia: o adapter saiu com o Asaas, e a tela mostra "não conectada" com o botão de conectar',
  collection_rules:
    'a régua de cobrança: nada envia ainda, e o cartão avisa isso antes de listar qualquer regra',
  workout_logs:
    'o caminho antigo do ganho de carga, só para a janela entre publicar e aplicar a 0055',
}

function sqlDeTodasAsMigrations(): string {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => readFileSync(join(MIGRATIONS, f), 'utf8'))
    .join('\n')
}

/** As tabelas que o esquema cria. */
function tabelasDoEsquema(sql: string): Set<string> {
  return new Set(
    [...sql.matchAll(/create table (?:if not exists )?([a-z_]+)\s*\(/g)].map((m) => m[1]),
  )
}

export function tabelasLidasSemEscritor(codigo: string, sql: string): string[] {
  const tabelas = tabelasDoEsquema(sql)
  const app = semComentarios(codigo)

  const lidas = new Set<string>()
  const escritas = new Set<string>()
  /*
   * O olhar adiante (`(?=…)`) não consome o texto. Sem ele, a primeira
   * ocorrência engole trezentos caracteres e **esconde a segunda** — então
   * uma tabela lida numa linha e escrita na seguinte passava como só lida, e
   * o guarda acusaria quem não deve. Foi o primeiro controle a falhar aqui.
   */
  for (const m of app.matchAll(/\.from\('([a-z_]+)'\)(?=([\s\S]{0,300}))/g)) {
    const [, tabela, depois] = m
    if (/^\s*\.(insert|update|upsert|delete)\(/.test(depois)) escritas.add(tabela)
    else lidas.add(tabela)
  }

  const escreveNoSql = (corpo: string) => {
    for (const w of corpo.matchAll(
      /\b(?:insert\s+into|update|delete\s+from)\s+(?:only\s+)?([a-z_]+)/g,
    )) {
      if (tabelas.has(w[1])) escritas.add(w[1])
    }
  }

  /*
   * Função do banco **que a aplicação chama**, e que escreve.
   *
   * Dois jeitos de chamar, e os dois contam: `.rpc('nome', …)` direto, e o
   * `chamarFuncao('operacao', 'nome', …)` — o ajudante que embrulha o `.rpc`
   * e traduz o erro. Enxergar só o primeiro fez este guarda acusar
   * `program_steps`, que é escrita por `save_program_step` desde a 0043.
   */
  const rpcs = new Set([
    ...[...app.matchAll(/\.rpc(?:<[^>]*>)?\(\s*'([a-z_]+)'/g)].map((m) => m[1]),
    ...[...app.matchAll(/chamarFuncao\(\s*'[^']*',\s*'([a-z_]+)'/g)].map((m) => m[1]),
  ])
  for (const m of sql.matchAll(/create or replace function ([a-z_]+)\s*\(([\s\S]*?)\$\$;/g)) {
    if (rpcs.has(m[1])) escreveNoSql(m[2])
  }
  // Gatilho escreve sem ninguém chamar.
  for (const m of sql.matchAll(/returns trigger([\s\S]*?)\$\$;/g)) escreveNoSql(m[1])

  /*
   * Semente de catálogo numa migration — **fora** de corpo de função. Com os
   * corpos dentro, o `insert` de uma função órfã contaria como semente, e uma
   * tabela escrita só por código morto passaria por viva. Era o terceiro
   * controle, e ele pegou exatamente isso.
   */
  const sqlSemFuncoes = sql.replace(/\$\$[\s\S]*?\$\$/g, '')
  for (const m of sqlSemFuncoes.matchAll(/insert into ([a-z_]+)\s*\(/g)) {
    if (tabelas.has(m[1])) escritas.add(m[1])
  }

  return [...lidas].filter((t) => tabelas.has(t) && !escritas.has(t)).sort()
}

const sql = sqlDeTodasAsMigrations()
const codigo = readFileSync(DATA_SOURCE, 'utf8')
const declaradas = ESPERANDO_FUNCIONALIDADE

describe('tabela lida sem escritor', () => {
  it('toda tabela sem escritor tem decisão registrada', () => {
    const semDecisao = tabelasLidasSemEscritor(codigo, sql).filter((t) => !(t in declaradas))

    /*
     * Falhou? A tela que lê esta tabela vai mostrar vazio em produção **e
     * funcionar na demonstração**, se a semente a preencher. Ou existe um
     * escritor e ele sumiu, ou a tela precisa dizer que a funcionalidade não
     * existe — e a tabela entra em `ESPERANDO_FUNCIONALIDADE` com o motivo.
     */
    expect(semDecisao).toEqual([])
  })

  it('nenhuma entrada ficou para trás', () => {
    const atuais = new Set(tabelasLidasSemEscritor(codigo, sql))
    const fantasmas = Object.keys(declaradas).filter((t) => !atuais.has(t))

    // Ganhou escritor, ou deixou de ser lida: a entrada sai junto.
    expect(fantasmas).toEqual([])
  })

  it('cada entrada diz o motivo', () => {
    const mudas = Object.entries(declaradas)
      .filter(([, motivo]) => motivo.trim().length < 20)
      .map(([t]) => t)
    expect(mudas).toEqual([])
  })
})

describe('o guarda enxerga o que diz enxergar', () => {
  /*
   * Os controles. Sem eles este arquivo passa porque não olha nada — e já
   * aconteceu neste projeto, com o guarda de constante de módulo cliente.
   */
  const esquema = `create table coisas (id uuid);\ncreate table outras (id uuid);\n`

  it('pega uma tabela lida e nunca escrita', () => {
    const app = `this.client.from('coisas').select('*')`
    expect(tabelasLidasSemEscritor(app, esquema)).toEqual(['coisas'])
  })

  it('não acusa quem é escrita pelo PostgREST', () => {
    const app = `this.client.from('coisas').select('*')\nthis.client.from('coisas').insert({ a: 1 })`
    expect(tabelasLidasSemEscritor(app, esquema)).toEqual([])
  })

  it('não acusa quem é escrita por função que a aplicação chama', () => {
    const comFuncao = `${esquema}
create or replace function grava() returns void language sql as $$
  insert into coisas (id) values (gen_random_uuid());
$$;`
    const app = `this.client.from('coisas').select('*')\nthis.client.rpc('grava', {})`
    expect(tabelasLidasSemEscritor(app, comFuncao)).toEqual([])
  })

  it('enxerga a função chamada pelo ajudante, não só pelo `.rpc` direto', () => {
    const comFuncao = `${esquema}
create or replace function grava() returns void language sql as $$
  insert into coisas (id) values (gen_random_uuid());
$$;`
    const app = `this.client.from('coisas').select('*')\nthis.chamarFuncao('grava', 'grava', {})`
    expect(tabelasLidasSemEscritor(app, comFuncao)).toEqual([])
  })

  it('não vale função que existe no banco e ninguém chama', () => {
    /*
     * A distinção que importa: `search_exercises` existe desde a 0021 e nunca
     * foi chamada. Função órfã não é escritor — e se fosse aceita aqui, uma
     * tabela escrita só por código morto passaria como viva.
     */
    const comFuncao = `${esquema}
create or replace function grava() returns void language sql as $$
  insert into coisas (id) values (gen_random_uuid());
$$;`
    const app = `this.client.from('coisas').select('*')`
    expect(tabelasLidasSemEscritor(app, comFuncao)).toEqual(['coisas'])
  })

  it('não acusa quem é semeada por migration', () => {
    const comSemente = `${esquema}\ninsert into coisas (id) values (gen_random_uuid());`
    const app = `this.client.from('coisas').select('*')`
    expect(tabelasLidasSemEscritor(app, comSemente)).toEqual([])
  })

  it('ignora tabela que não existe no esquema', () => {
    const app = `this.client.from('inventada').select('*')`
    expect(tabelasLidasSemEscritor(app, esquema)).toEqual([])
  })
})
