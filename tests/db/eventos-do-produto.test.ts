import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ALPHA, applyMigrations, asUser, connect, databaseAvailable, seedTwoGyms } from './helpers'

/**
 * Os eventos do produto (0060).
 *
 * Não havia indicador de produto nenhum, e a pergunta mais básica de um produto
 * de treino — quantos treinos iniciados viram concluídos — não tinha resposta.
 *
 * O que estes testes protegem, em ordem de importância:
 *
 *   1. O evento não pode dizer que é de outra conta. Quem é a pessoa sai do
 *      `auth.uid()`.
 *   2. O reenvio não pode contar duas vezes. Indicador que infla com
 *      retentativa de rede mente para quem decide.
 *   3. A tabela não pode virar cópia do dado sensível: vocabulário fechado, sem
 *      campo livre.
 *   4. O aluno não lê a tabela. Ela é instrumento de operação, e abrir leitura
 *      por conta criaria um segundo caminho para o mesmo dado com outra
 *      política.
 */

let client: Client
const temBanco = await databaseAvailable()
const AUTH_A = '6e6e6e6e-6e6e-6e6e-6e6e-6e6e6e6e6e6e'
const AUTH_B = '6e6e6e6e-6e6e-6e6e-6e6e-6e6e6e6e6e6f'
let perfilA: string
let perfilB: string

async function darConta(studentId: string, authId: string, email: string) {
  const { rows } = await client.query(`select user_profile_id from students where id = $1`, [
    studentId,
  ])
  await client.query(`insert into auth.users (id, email) values ($1,$2)`, [authId, email])
  await client.query(`update user_profiles set auth_user_id = $1 where id = $2`, [
    authId,
    rows[0].user_profile_id,
  ])
  return rows[0].user_profile_id as string
}

const registrar = (
  auth: string,
  nome: string,
  clientId: string,
  rotulo: string | null = null,
  valor: number | null = null,
) =>
  asUser(client, auth, `select registrar_evento($1, $2, $3, $4::numeric)`, [
    nome,
    clientId,
    rotulo,
    valor,
  ])

const eventos = async (perfil: string) => {
  const { rows } = await client.query(
    `select name, rotulo, valor::float8 as valor, organization_id
     from product_events where user_profile_id = $1 order by occurred_at, name`,
    [perfil],
  )
  return rows as {
    name: string
    rotulo: string | null
    valor: number | null
    organization_id: string | null
  }[]
}

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)
  await seedTwoGyms(client, 2)

  const { rows } = await client.query(
    `select id from students where organization_id = $1 order by id`,
    [ALPHA.orgId],
  )
  perfilA = await darConta(rows[0].id, AUTH_A, 'ev1@alpha.test')
  perfilB = await darConta(rows[1].id, AUTH_B, 'ev2@alpha.test')
}, 60_000)

afterAll(async () => {
  await client?.end()
})

const limpar = () => client.query(`delete from product_events`)

describe.skipIf(!temBanco)('quem o evento diz que é', () => {
  it('a pessoa sai da sessão autenticada', async () => {
    await limpar()
    await registrar(AUTH_A, 'TREINO_INICIADO', 'e-1')

    expect((await eventos(perfilA)).map((e) => e.name)).toEqual(['TREINO_INICIADO'])
    expect(await eventos(perfilB)).toEqual([])
  })

  it('sem conta autenticada, nada é gravado', async () => {
    /*
     * A função devolve em silêncio quando `auth.uid()` é nulo, em vez de
     * estourar: instrumentação que derruba a operação que observa é pior que
     * instrumentação ausente.
     *
     * E ela não tem como adivinhar de quem é o evento. Nenhum evento do
     * catálogo precisa de anônimo — a escolha de entrada acontece no
     * onboarding, com a pessoa já autenticada —, e abrir isto para `anon` daria
     * a qualquer um uma tabela para encher.
     *
     * Consulta sem `asUser` de propósito: é assim que fica sem claims de JWT.
     */
    await limpar()
    await client.query(`select registrar_evento('TREINO_INICIADO', 'sem-conta')`)

    const { rows } = await client.query(`select count(*)::int as total from product_events`)
    expect(rows[0].total).toBe(0)
  })

  it('a academia vem do vínculo, não do argumento', async () => {
    // Sem isso, o indicador por academia seria o que o cliente dissesse que é.
    await limpar()
    await registrar(AUTH_A, 'TREINO_INICIADO', 'e-1')

    expect((await eventos(perfilA))[0].organization_id).toBe(ALPHA.orgId)
  })
})

describe.skipIf(!temBanco)('o reenvio', () => {
  it('não conta duas vezes', async () => {
    /*
     * A fila do Treino Ativo remanda o que não teve resposta, e o React monta
     * componente duas vezes em modo estrito. O mesmo `client_id` chega de novo
     * e não cria linha — é o requisito "evitar duplicação por reenvio ou
     * renderização".
     */
    await limpar()
    await registrar(AUTH_A, 'SERIE_CONCLUIDA', 's-1')
    await registrar(AUTH_A, 'SERIE_CONCLUIDA', 's-1')
    await registrar(AUTH_A, 'SERIE_CONCLUIDA', 's-1')

    expect(await eventos(perfilA)).toHaveLength(1)
  })

  it('mas o mesmo identificador em evento diferente é outro acontecimento', async () => {
    /*
     * Controle do teste acima: a unicidade é `(name, client_id)`, não
     * `client_id` sozinho. O identificador da série identifica a série, e a
     * mesma série pode ser concluída e depois desfeita.
     */
    await limpar()
    await registrar(AUTH_A, 'SERIE_CONCLUIDA', 's-1')
    await registrar(AUTH_A, 'SERIE_DESFEITA', 's-1')

    expect((await eventos(perfilA)).map((e) => e.name)).toEqual([
      'SERIE_CONCLUIDA',
      'SERIE_DESFEITA',
    ])
  })

  it('identificador vazio é recusado', async () => {
    await limpar()
    await expect(registrar(AUTH_A, 'TREINO_INICIADO', '   ')).rejects.toThrow(/ausente/i)
  })
})

describe.skipIf(!temBanco)('o vocabulário fechado', () => {
  it('nome fora da lista é recusado', async () => {
    // Nome inventado no cliente produz série temporal que ninguém sabe ler seis
    // meses depois. Evento novo exige migration.
    await limpar()
    await expect(registrar(AUTH_A, 'QUALQUER_COISA', 'x-1')).rejects.toThrow(
      /product_events|check/i,
    )
  })

  it('rótulo fora da lista é recusado', async () => {
    await limpar()
    await expect(registrar(AUTH_A, 'TREINO_INICIADO', 'x-1', 'PESO_DE_ONTEM')).rejects.toThrow(
      /product_events|check/i,
    )
  })

  it('não existe campo livre para receber texto', async () => {
    /*
     * A trava estrutural contra a tabela de métrica virar cópia do dado
     * sensível: não há coluna de texto livre nem `jsonb` onde o nome do
     * exercício, a observação do treinador ou a frase que a pessoa digitou
     * possam cair.
     */
    const { rows } = await client.query(
      `select column_name, data_type from information_schema.columns
       where table_name = 'product_events' order by column_name`,
    )
    const texto = rows.filter((r) => ['text', 'jsonb', 'json'].includes(r.data_type))
    // `name` e `rotulo` têm `check`; `client_id` é identificador gerado no
    // aparelho. Nenhum outro texto entra.
    expect(texto.map((r) => r.column_name).sort()).toEqual(['client_id', 'name', 'rotulo'])
  })

  it('valor negativo é recusado', async () => {
    await limpar()
    await expect(registrar(AUTH_A, 'TREINO_CONCLUIDO', 'x-1', null, -5)).rejects.toThrow(/check/i)
  })
})

describe.skipIf(!temBanco)('quem lê', () => {
  it('o aluno não lê a tabela', async () => {
    /*
     * Deliberado: a tela que mostra o que a pessoa fez lê o histórico de
     * treino, que é dado dela com política própria. Esta tabela é instrumento
     * de operação.
     */
    await limpar()
    await registrar(AUTH_A, 'TREINO_INICIADO', 'e-1')

    const lido = await asUser<{ total: number }>(
      client,
      AUTH_A,
      `select count(*)::int as total from product_events`,
    )
    expect(lido[0].total).toBe(0)
  })

  it('ninguém escreve direto na tabela', async () => {
    // A escrita passa pela função, que resolve a pessoa pelo `auth.uid()`.
    await expect(
      asUser(
        client,
        AUTH_A,
        `insert into product_events (name, client_id) values ('TREINO_INICIADO','colado')`,
      ),
    ).rejects.toThrow(/permission denied|permissão|policy/i)
  })
})

describe.skipIf(!temBanco)('os indicadores', () => {
  const indicadores = async () => {
    const { rows } = await client.query(`select * from indicadores_do_produto(30)`)
    return rows[0] as Record<string, unknown>
  }

  it('contam iniciados e concluídos separados', async () => {
    await limpar()
    await registrar(AUTH_A, 'TREINO_INICIADO', 't-1')
    await registrar(AUTH_A, 'TREINO_INICIADO', 't-2')
    await registrar(AUTH_A, 'TREINO_CONCLUIDO', 't-1', null, 1800)

    const i = await indicadores()
    expect(Number(i.treinos_iniciados)).toBe(2)
    expect(Number(i.treinos_concluidos)).toBe(1)
  })

  it('a coorte é quem se cadastrou na janela, e ela sai dita por extenso', async () => {
    /*
     * Retenção de 30 dias calculada sobre quem se cadastrou ontem é zero por
     * construção. `coorte_desde` sai no resultado para que ninguém leia o
     * número sem saber de quem ele é.
     */
    await limpar()
    await registrar(AUTH_A, 'CADASTRO_CONCLUIDO', 'c-1', 'PESSOAL')

    const i = await indicadores()
    expect(Number(i.coorte_tamanho)).toBe(1)
    expect(i.coorte_desde).toBeInstanceOf(Date)
  })

  it('a ativação é o primeiro treino de quem se cadastrou', async () => {
    await limpar()
    await registrar(AUTH_A, 'CADASTRO_CONCLUIDO', 'c-1', 'PESSOAL')
    await registrar(AUTH_B, 'CADASTRO_CONCLUIDO', 'c-2', 'PESSOAL')
    await registrar(AUTH_A, 'TREINO_INICIADO', 't-1')

    const i = await indicadores()
    expect(Number(i.coorte_tamanho)).toBe(2)
    expect(Number(i.ativados)).toBe(1)
  })

  it('a escolha da porta conta pessoas, não recarregamentos', async () => {
    /*
     * A escolha é contada na chegada à tela do formulário, e recarregar grava
     * outra linha — o que não pode virar outra pessoa no funil.
     */
    await limpar()
    await registrar(AUTH_A, 'ENTRADA_ESCOLHIDA', 'p-1', 'PESSOAL')
    await registrar(AUTH_A, 'ENTRADA_ESCOLHIDA', 'p-2', 'PESSOAL')
    await registrar(AUTH_B, 'ENTRADA_ESCOLHIDA', 'p-3', 'ACADEMIA')

    expect(Number((await indicadores()).escolheram_entrada)).toBe(2)
  })

  it('a perda e a recuperação de sessão aparecem', async () => {
    await limpar()
    await registrar(AUTH_A, 'TREINO_RECUPERADO', 'r-1')
    await registrar(AUTH_A, 'REGISTRO_PERDIDO', 'x-1', 'SERIE', 3)

    const i = await indicadores()
    expect(Number(i.treinos_recuperados)).toBe(1)
    expect(Number(i.registros_perdidos)).toBe(1)
  })

  it('sem evento nenhum, os números são zero e não nulos', async () => {
    // Painel que recebe `null` mostra "—" onde deveria mostrar zero, e aí
    // alguém conclui que a medição quebrou.
    await limpar()
    const i = await indicadores()
    expect(Number(i.coorte_tamanho)).toBe(0)
    expect(Number(i.treinos_iniciados)).toBe(0)
    expect(Number(i.retornaram_7)).toBe(0)
  })
})
