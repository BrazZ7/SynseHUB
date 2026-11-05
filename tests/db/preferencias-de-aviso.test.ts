import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { applyMigrations, asUser, connect, databaseAvailable } from './helpers'

/**
 * As preferências de aviso (0065).
 *
 * O que estes testes protegem é o **ponto único**: todo aviso do produto passa
 * por `notify_profiles`, e é lá dentro que a escolha da pessoa é respeitada.
 * Testar pelos gatilhos de verdade — e não chamando a função direto — é o que
 * prova que o caminho real honra a preferência.
 *
 * Três riscos:
 *
 *  - **Desligar demais.** Silenciar uma categoria não pode calar as outras, e
 *    não pode calar a mesma categoria para outra pessoa.
 *  - **Desligar de menos.** Sem linha é ligado, e é o estado de todo mundo que
 *    existia antes desta migration — ninguém pode mudar de comportamento.
 *  - **Silenciar o alheio.** A função resolve o perfil por `auth.uid()`;
 *    receber o perfil do cliente deixaria esconder cobrança de outra pessoa.
 */

let client: Client
const temBanco = await databaseAvailable()

const DONA = '99999999-9999-9999-9999-999999999991'
const ALUNO = '99999999-9999-9999-9999-999999999992'
const COLEGA = '99999999-9999-9999-9999-999999999993'
const ORG = 'dddddddd-0000-0000-0000-000000000004'

let donaProfile: string
let alunoProfile: string
let colegaProfile: string
let alunoStudent: string
let colegaStudent: string
let plano: string

const avisos = (profileId: string, categoria?: string) =>
  client
    .query(
      `select category, title from notifications
       where user_profile_id = $1 ${categoria ? 'and category = $2' : ''}
       order by created_at`,
      categoria ? [profileId, categoria] : [profileId],
    )
    .then((r) => r.rows as { category: string; title: string }[])

const preferir = (categoria: string, ligado: boolean, auth = ALUNO) =>
  asUser(client, auth, `select set_notification_preference($1, $2)`, [categoria, ligado])

/** Dispara um aviso de verdade, pelo gatilho que o produto usa. */
const cobrar = (studentId: string, valor: number) =>
  client.query(
    `insert into charges (organization_id, student_id, amount, description, due_date, status)
     values ($1, $2, $3, 'Mensalidade', current_date + 5, 'PENDING')`,
    [ORG, studentId, valor],
  )

const atribuirTreino = (studentId: string) =>
  client.query(
    `insert into workout_assignments (organization_id, workout_plan_id, student_id)
     values ($1, $2, $3)`,
    [ORG, plano, studentId],
  )

const limpar = () => client.query(`delete from notifications; delete from workout_assignments;`)

async function criarAluno(authId: string, nome: string, email: string) {
  await client.query(`insert into auth.users (id, email) values ($1,$2)`, [authId, email])
  const perfil = await client.query(
    `insert into user_profiles (auth_user_id, name, email) values ($1,$2,$3) returning id`,
    [authId, nome, email],
  )
  // `students` é só o vínculo da matrícula: nome e e-mail moram no perfil.
  const student = await client.query(
    `insert into students (organization_id, user_profile_id, status)
     values ($1,$2,'ACTIVE') returning id`,
    [ORG, perfil.rows[0].id],
  )
  return { perfil: perfil.rows[0].id as string, student: student.rows[0].id as string }
}

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)

  await client.query(`insert into auth.users (id, email) values ($1,'dona@p.test')`, [DONA])
  await client.query(
    `insert into organizations (id, name, slug, invite_code, status)
     values ($1,'Academia Pref','pref','PREF22','ACTIVE')`,
    [ORG],
  )
  const dona = await client.query(
    `insert into user_profiles (auth_user_id, name, email) values ($1,'Dona','dona@p.test')
     returning id`,
    [DONA],
  )
  donaProfile = dona.rows[0].id
  await client.query(
    `insert into organization_members (organization_id, user_profile_id, role) values ($1,$2,'OWNER')`,
    [ORG, donaProfile],
  )

  const a = await criarAluno(ALUNO, 'Aluno Pref', 'aluno@p.test')
  alunoProfile = a.perfil
  alunoStudent = a.student
  const c = await criarAluno(COLEGA, 'Colega Pref', 'colega@p.test')
  colegaProfile = c.perfil
  colegaStudent = c.student

  plano = (
    await client.query(
      `insert into workout_plans (organization_id, name) values ($1,'Treino A') returning id`,
      [ORG],
    )
  ).rows[0].id
}, 60_000)

afterAll(async () => {
  await client?.end()
})

describe.skipIf(!temBanco)('sem escolha, recebe tudo', () => {
  it('quem nunca mexeu continua avisado', async () => {
    /*
     * O estado de toda conta que existia antes da 0065. Se esta falhar, a
     * migration calou o produto inteiro em silêncio.
     */
    await limpar()
    await client.query(`delete from notification_preferences`)
    await cobrar(alunoStudent, 100)
    await atribuirTreino(alunoStudent)

    const todos = await avisos(alunoProfile)
    expect(todos.map((a) => a.category).sort()).toEqual(['PAYMENT', 'WORKOUT'])
  })

  it('linha ligada é o mesmo que linha nenhuma', async () => {
    await limpar()
    await preferir('PAYMENT', true)
    await cobrar(alunoStudent, 100)
    expect(await avisos(alunoProfile, 'PAYMENT')).toHaveLength(1)
  })
})

describe.skipIf(!temBanco)('desligar uma categoria', () => {
  it('cala a categoria desligada', async () => {
    await limpar()
    await preferir('PAYMENT', false)
    await cobrar(alunoStudent, 100)
    expect(await avisos(alunoProfile, 'PAYMENT')).toHaveLength(0)
  })

  it('não cala as outras', async () => {
    /*
     * O defeito que mais importa: um filtro escrito errado — `or` no lugar de
     * `and`, por exemplo — cala tudo, e ninguém percebe porque aviso que não
     * chega não gera erro.
     */
    await limpar()
    await preferir('PAYMENT', false)
    await cobrar(alunoStudent, 100)
    await atribuirTreino(alunoStudent)

    const todos = await avisos(alunoProfile)
    expect(todos.map((a) => a.category)).toEqual(['WORKOUT'])
  })

  it('não cala a mesma categoria para outra pessoa', async () => {
    await limpar()
    await preferir('PAYMENT', false, ALUNO)
    await cobrar(alunoStudent, 100)
    await cobrar(colegaStudent, 100)

    expect(await avisos(alunoProfile, 'PAYMENT')).toHaveLength(0)
    expect(await avisos(colegaProfile, 'PAYMENT')).toHaveLength(1)
  })

  it('religar volta a avisar', async () => {
    await limpar()
    await preferir('PAYMENT', false)
    await cobrar(alunoStudent, 100)
    expect(await avisos(alunoProfile, 'PAYMENT')).toHaveLength(0)

    await preferir('PAYMENT', true)
    await cobrar(alunoStudent, 200)
    expect(await avisos(alunoProfile, 'PAYMENT')).toHaveLength(1)
  })

  it('vale para a equipe, não só para o aluno', async () => {
    /*
     * `notify_profiles` avisa dono e aluno pelo mesmo caminho. A recepção que
     * não quer nove avisos de matrícula por dia tem o mesmo direito — a tela
     * dela ainda não existe, a linha já funciona.
     */
    await limpar()
    await preferir('GYM', false, DONA)

    const novo = await criarAluno(
      '99999999-9999-9999-9999-99999999999a',
      'Entrou Agora',
      'novo@p.test',
    )
    expect(novo.student).toBeTruthy()
    await client.query(`update students set status = 'ACTIVE' where id = $1`, [novo.student])

    expect(await avisos(donaProfile, 'GYM')).toHaveLength(0)
  })
})

describe.skipIf(!temBanco)('quem escolhe', () => {
  it('a escolha é de quem está autenticado, não do que o cliente mandar', async () => {
    /*
     * A função não aceita perfil. Se aceitasse, dava para silenciar a cobrança
     * de outra pessoa — jeito silencioso de esconder dívida de alguém.
     */
    await limpar()
    await client.query(`delete from notification_preferences`)
    await preferir('PAYMENT', false, COLEGA)

    const { rows } = await client.query(
      `select user_profile_id from notification_preferences where category = 'PAYMENT'`,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].user_profile_id).toBe(colegaProfile)
  })

  it('categoria inventada é recusada', async () => {
    await expect(preferir('MARKETING', false)).rejects.toThrow(/Categoria desconhecida/)
  })

  it('conta sem perfil não escolhe', async () => {
    await expect(
      asUser(client, null, `select set_notification_preference('PAYMENT', false)`),
    ).rejects.toThrow(/permission denied|permissão negada/i)
  })

  it('insert direto é negado — a escrita passa pela função', async () => {
    await expect(
      asUser(
        client,
        ALUNO,
        `insert into notification_preferences (user_profile_id, category, enabled)
         values ($1, 'PAYMENT', false)`,
        [colegaProfile],
      ),
    ).rejects.toThrow(/permission denied|permissão negada/i)
  })
})

describe.skipIf(!temBanco)('quem lê a escolha', () => {
  it('a pessoa lê a própria', async () => {
    await client.query(`delete from notification_preferences`)
    await preferir('CONTENT', false)
    const minhas = await asUser(
      client,
      ALUNO,
      `select category from notification_preferences where user_profile_id = $1`,
      [alunoProfile],
    )
    expect(minhas).toHaveLength(1)
  })

  it('a academia NÃO lê a do aluno', async () => {
    /*
     * De propósito, e é a única tabela de aluno em que a academia não entra:
     * saber que alguém silenciou "cobrança" é informação para cobrar por fora,
     * e a tela que mostrasse isso seria usada para isso.
     */
    await client.query(`delete from notification_preferences`)
    await preferir('CONTENT', false)
    const daDona = await asUser(
      client,
      DONA,
      `select category from notification_preferences where user_profile_id = $1`,
      [alunoProfile],
    )
    expect(daDona).toHaveLength(0)
  })

  it('o colega também não lê', async () => {
    await client.query(`delete from notification_preferences`)
    await preferir('CONTENT', false)
    const doColega = await asUser(
      client,
      COLEGA,
      `select category from notification_preferences where user_profile_id = $1`,
      [alunoProfile],
    )
    expect(doColega).toHaveLength(0)
  })
})

describe.skipIf(!temBanco)('a função que escreve aviso continua fechada', () => {
  it('`notify_profiles` não voltou a ser executável depois do `create or replace`', async () => {
    /*
     * `notify_profiles` é a única função do projeto revogada também de
     * `authenticated`: ela escreve aviso em nome de qualquer pessoa.
     *
     * **Tirar o `revoke` da 0065 não quebra este teste**, e isso está certo:
     * conferido no Postgres, substituir função existente preserva o ACL. O
     * que nasce aberto é função **nova** — foi assim na 0061, com uma
     * assinatura de sete argumentos no lugar de cinco. Então aquele `revoke` é
     * defesa para o dia em que a assinatura mudar, e este teste é a trava que
     * pega o dia em que ela mudar sem ele.
     */
    for (const papel of ['public', 'anon', 'authenticated']) {
      const { rows } = await client.query(
        `select has_function_privilege($1,'notify_profiles(uuid[],uuid,text,text,text,text)','execute') as pode`,
        [papel],
      )
      expect(rows[0].pode, papel).toBe(false)
    }
  })
})
