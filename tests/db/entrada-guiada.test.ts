import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  ALPHA,
  BETA,
  applyMigrations,
  asUser,
  connect,
  databaseAvailable,
  seedTwoGyms,
} from './helpers'

/**
 * A entrada guiada do aluno (0063).
 *
 * O que estes testes protegem:
 *
 *  - **A matrícula não vem do cliente.** As duas funções resolvem o aluno por
 *    `auth.uid()`. Se aceitassem `student_id`, dava para responder pela
 *    matrícula de outra pessoa — e `organization_id` vai junto, então o
 *    objetivo apareceria na ficha de outra academia.
 *  - **Pular é um estado.** É o que faz a porta do `/app` parar de desviar. Um
 *    "pular" que não grava transforma a boa-vinda em obstáculo a cada
 *    abertura do app.
 *  - **Respondido é respondido inteiro.** A trava do banco existe para a ficha
 *    do professor poder confiar que `completed_at` significa as três
 *    respostas, e não uma.
 */

let client: Client
const temBanco = await databaseAvailable()
const AUTH_ALUNO = '77777777-7777-7777-7777-777777777771'
const AUTH_VIZINHO = '77777777-7777-7777-7777-777777777772'
let aluno: string
let vizinho: string

async function darConta(studentId: string, authId: string, email: string) {
  const { rows } = await client.query(`select user_profile_id from students where id = $1`, [
    studentId,
  ])
  await client.query(`insert into auth.users (id, email) values ($1,$2)`, [authId, email])
  await client.query(`update user_profiles set auth_user_id = $1 where id = $2`, [
    authId,
    rows[0].user_profile_id,
  ])
}

const responder = ({
  objetivo = 'EMAGRECER',
  experiencia = 'NUNCA_TREINEI',
  dias = 3,
  auth = AUTH_ALUNO,
} = {}) =>
  asUser(client, auth, `select set_student_intake($1, $2, $3::smallint)`, [
    objetivo,
    experiencia,
    dias,
  ])

const pular = (auth = AUTH_ALUNO) => asUser(client, auth, `select skip_student_intake()`)

const ler = async (studentId: string) => {
  const { rows } = await client.query(
    `select organization_id, goal, experience, days_per_week, completed_at, skipped_at
     from student_intake where student_id = $1`,
    [studentId],
  )
  return rows[0] as
    | {
        organization_id: string
        goal: string | null
        experience: string | null
        days_per_week: number | null
        completed_at: Date | null
        skipped_at: Date | null
      }
    | undefined
}

const limpar = () => client.query(`delete from student_intake`)

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)
  await seedTwoGyms(client, 2)

  const { rows } = await client.query(
    `select id from students where organization_id = $1 order by id`,
    [ALPHA.orgId],
  )
  aluno = rows[0].id
  vizinho = rows[1].id
  await darConta(aluno, AUTH_ALUNO, 'entrada1@alpha.test')
  await darConta(vizinho, AUTH_VIZINHO, 'entrada2@alpha.test')
}, 60_000)

afterAll(async () => {
  await client?.end()
})

describe.skipIf(!temBanco)('responder a entrada', () => {
  it('grava as três respostas na matrícula de quem respondeu', async () => {
    await limpar()
    await responder({ objetivo: 'GANHAR_MASSA', experiencia: 'VOLTANDO', dias: 4 })

    const linha = await ler(aluno)
    expect(linha?.goal).toBe('GANHAR_MASSA')
    expect(linha?.experience).toBe('VOLTANDO')
    expect(linha?.days_per_week).toBe(4)
    expect(linha?.completed_at).toBeInstanceOf(Date)
    expect(linha?.skipped_at).toBeNull()
    // Da matrícula, nunca do cliente: a função nem aceita academia.
    expect(linha?.organization_id).toBe(ALPHA.orgId)
  })

  it('não grava nada na matrícula do colega', async () => {
    await limpar()
    await responder()
    expect(await ler(vizinho)).toBeUndefined()
  })

  it('responder de novo corrige, e não cria segunda linha', async () => {
    await limpar()
    await responder({ dias: 2 })
    await responder({ objetivo: 'SAUDE', experiencia: 'TREINO_SEMPRE', dias: 6 })

    const { rows } = await client.query(`select count(*)::int as n from student_intake`)
    expect(rows[0].n).toBe(1)
    const linha = await ler(aluno)
    expect(linha?.goal).toBe('SAUDE')
    expect(linha?.days_per_week).toBe(6)
  })

  it('o primeiro "respondido em" não se move na correção', async () => {
    /*
     * `coalesce(completed_at, now())`. Se cada correção reescrevesse a data,
     * qualquer relatório de "quanto tempo até o aluno responder" mediria a
     * última edição em vez da entrada.
     */
    await limpar()
    await responder()
    const primeiro = (await ler(aluno))?.completed_at
    await responder({ dias: 5 })
    expect((await ler(aluno))?.completed_at?.getTime()).toBe(primeiro?.getTime())
  })

  it('recusa dias fora da faixa', async () => {
    await limpar()
    await expect(responder({ dias: 0 })).rejects.toThrow(/fora da faixa/)
    await expect(responder({ dias: 8 })).rejects.toThrow(/fora da faixa/)
    expect(await ler(aluno)).toBeUndefined()
  })

  it('recusa objetivo que não está na lista', async () => {
    await limpar()
    await expect(responder({ objetivo: 'VIRAR_ATLETA_OLIMPICO' })).rejects.toThrow()
    expect(await ler(aluno)).toBeUndefined()
  })

  it('conta sem matrícula não responde', async () => {
    await limpar()
    // A dona da academia não é aluna: não há matrícula para `auth.uid()`.
    await expect(responder({ auth: ALPHA.authId })).rejects.toThrow(/Nenhum aluno para esta conta/)
  })

  it('insert direto é negado — a escrita passa pela função', async () => {
    await limpar()
    await expect(
      asUser(
        client,
        AUTH_ALUNO,
        `insert into student_intake (student_id, organization_id, goal) values ($1, $2, 'SAUDE')`,
        [aluno, BETA.orgId],
      ),
    ).rejects.toThrow(/permission denied|permissão negada/i)
  })
})

describe.skipIf(!temBanco)('pular', () => {
  it('grava a recusa, sem inventar respostas', async () => {
    await limpar()
    await pular()

    const linha = await ler(aluno)
    expect(linha?.skipped_at).toBeInstanceOf(Date)
    expect(linha?.completed_at).toBeNull()
    expect(linha?.goal).toBeNull()
    expect(linha?.days_per_week).toBeNull()
  })

  it('pular duas vezes não move o carimbo', async () => {
    await limpar()
    await pular()
    const primeiro = (await ler(aluno))?.skipped_at
    await pular()
    expect((await ler(aluno))?.skipped_at?.getTime()).toBe(primeiro?.getTime())
  })

  it('quem pulou e depois responde deixa de estar pulado', async () => {
    /*
     * A resposta vale mais que a recusa anterior. Sem isto a ficha do
     * professor mostraria as três respostas ao lado de "ainda não respondeu".
     */
    await limpar()
    await pular()
    await responder({ dias: 3 })

    const linha = await ler(aluno)
    expect(linha?.skipped_at).toBeNull()
    expect(linha?.completed_at).toBeInstanceOf(Date)
  })

  it('pular depois de responder não apaga a resposta', async () => {
    await limpar()
    await responder({ objetivo: 'CONDICIONAMENTO', dias: 5 })
    await pular()

    const linha = await ler(aluno)
    expect(linha?.goal).toBe('CONDICIONAMENTO')
    expect(linha?.completed_at).toBeInstanceOf(Date)
  })
})

describe.skipIf(!temBanco)('a trava do respondido inteiro', () => {
  it('o banco recusa "respondido" com resposta faltando', async () => {
    /*
     * A ficha do professor confia em `completed_at` para dizer "respondeu".
     * Sem a trava dava para existir uma linha completa com objetivo nulo, e a
     * tela mostraria "respondeu" ao lado de três traços.
     */
    await limpar()
    await expect(
      client.query(
        `insert into student_intake (student_id, organization_id, experience, days_per_week, completed_at)
         values ($1, $2, 'VOLTANDO', 3, now())`,
        [aluno, ALPHA.orgId],
      ),
    ).rejects.toThrow(/student_intake_completo/)
  })
})

describe.skipIf(!temBanco)('quem lê', () => {
  it('o aluno lê o que declarou', async () => {
    await limpar()
    await responder()
    const dele = await asUser(
      client,
      AUTH_ALUNO,
      `select goal from student_intake where student_id = $1`,
      [aluno],
    )
    expect(dele).toHaveLength(1)
  })

  it('a academia dele lê — é para isso que serve', async () => {
    await limpar()
    await responder()
    const daAlpha = await asUser(
      client,
      ALPHA.authId,
      `select goal from student_intake where student_id = $1`,
      [aluno],
    )
    expect(daAlpha).toHaveLength(1)
  })

  it('a academia vizinha não vê nada', async () => {
    await limpar()
    await responder()
    const daBeta = await asUser(
      client,
      BETA.authId,
      `select goal from student_intake where student_id = $1`,
      [aluno],
    )
    expect(daBeta).toHaveLength(0)
  })

  it('o colega não vê a declaração alheia', async () => {
    await limpar()
    await responder()
    const doVizinho = await asUser(
      client,
      AUTH_VIZINHO,
      `select goal from student_intake where student_id = $1`,
      [aluno],
    )
    expect(doVizinho).toHaveLength(0)
  })

  it('nem a academia escreve pelo aluno', async () => {
    /*
     * Ao contrário da maioria das tabelas, a política do staff é só `select`.
     * A anotação do professor já tem lugar: `students.goal`, no cadastro.
     * Escrever aqui seria pôr palavra na boca de quem declarou.
     */
    await limpar()
    await responder()
    await expect(
      asUser(
        client,
        ALPHA.authId,
        `update student_intake set goal = 'SAUDE' where student_id = $1`,
        [aluno],
      ),
    ).rejects.toThrow(/permission denied|permissão negada/i)
  })
})
