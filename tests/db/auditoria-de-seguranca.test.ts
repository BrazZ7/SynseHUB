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
 * ── Os furos que a auditoria achou ──────────────────────────────────────────
 *
 * Cada teste aqui é **um ataque escrito como teste**. Todos eles passavam —
 * no sentido de "o ataque funcionava" — antes da 0046. Agora cada um afirma
 * que o ataque **falha**.
 *
 * Escrever assim, e não como "a política está correta", é deliberado: uma
 * asserção sobre o texto da política envelhece na primeira reescrita, e foi
 * exatamente uma reescrita que criou metade destes furos. A 0008 declarava
 * "a regra de negócio é idêntica — quem enxerga o quê não muda em nada" e
 * mudou três coisas. Um ataque reproduzido não se engana sobre isso.
 *
 * Papéis: ALPHA é a academia da vítima, BETA é a do atacante.
 */

let client: Client
const temBanco = await databaseAvailable()

const AUTH_RECEP_BETA = 'eeee1111-1111-1111-1111-111111111111'
const AUTH_ALUNO_ALPHA = 'eeee2222-2222-2222-2222-222222222222'
const AUTH_FORA = 'eeee3333-3333-3333-3333-333333333333'

let alunoAlpha: string // students.id na Alpha
let perfilAlunoAlpha: string
let perfilFora: string
let staffAlpha: string
let staffBeta: string

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)
  await seedTwoGyms(client, 2)

  const { rows: alunos } = await client.query(
    `select id, user_profile_id from students where organization_id = $1 order by id limit 1`,
    [ALPHA.orgId],
  )
  alunoAlpha = alunos[0].id
  perfilAlunoAlpha = alunos[0].user_profile_id

  await client.query(`insert into auth.users (id, email) values ($1,$2)`, [
    AUTH_ALUNO_ALPHA,
    'aluno@alpha.test',
  ])
  await client.query(`update user_profiles set auth_user_id = $1, email = $2 where id = $3`, [
    AUTH_ALUNO_ALPHA,
    'aluno@alpha.test',
    perfilAlunoAlpha,
  ])

  // Uma recepcionista na Beta — papel que a 0004 deixou de fora do dado de saúde.
  await client.query(`insert into auth.users (id, email) values ($1,$2)`, [
    AUTH_RECEP_BETA,
    'recep@beta.test',
  ])
  const { rows: recep } = await client.query(
    `insert into user_profiles (auth_user_id, name, email) values ($1,'Recep Beta',$2) returning id`,
    [AUTH_RECEP_BETA, 'recep@beta.test'],
  )
  await client.query(
    `insert into organization_members (organization_id, user_profile_id, role, status)
     values ($1,$2,'RECEPTIONIST','ACTIVE')`,
    [BETA.orgId, recep[0].id],
  )

  /*
   * Uma conta Synse que não é aluna de academia nenhuma — a vítima do
   * sequestro por lead. É o caso mais comum do produto: quem entrou pelo
   * Synse Solo e nunca pisou numa academia.
   */
  await client.query(`insert into auth.users (id, email) values ($1,$2)`, [
    AUTH_FORA,
    'vitima@fora.test',
  ])
  const { rows: fora } = await client.query(
    `insert into user_profiles (auth_user_id, name, email) values ($1,'Vítima de Fora',$2) returning id`,
    [AUTH_FORA, 'vitima@fora.test'],
  )
  perfilFora = fora[0].id

  /*
   * Equipe nas duas academias. `nutrition_plans.author_staff_id` é NOT NULL
   * — "plano individual só existe com profissional responsável", diz a 0003.
   *
   * A primeira versão deste arquivo não criava staff, e o resultado foi um
   * teste que **passou pelo motivo errado**: o insert do atacante morria no
   * NOT NULL, não na RLS, e eu quase concluí que o furo não existia.
   */
  for (const [gym, slot] of [
    [ALPHA, 'alpha'],
    [BETA, 'beta'],
  ] as const) {
    const { rows: dono } = await client.query(
      `select user_profile_id from organization_members
        where organization_id = $1 and role = 'OWNER' limit 1`,
      [gym.orgId],
    )
    const { rows: st } = await client.query(
      `insert into staff (organization_id, user_profile_id, role, status)
       values ($1,$2,'NUTRITIONIST','ACTIVE') returning id`,
      [gym.orgId, dono[0].user_profile_id],
    )
    if (slot === 'alpha') staffAlpha = st[0].id
    else staffBeta = st[0].id
  }

  // Dado de saúde da vítima, para os testes de leitura.
  await client.query(
    `insert into assessments (organization_id, student_id, weight, height, notes)
     values ($1, $2, 70.0, 175.0, 'anotação clínica da vítima')`,
    [ALPHA.orgId, alunoAlpha],
  )
}, 60_000)

afterAll(async () => {
  await client?.end()
})

describe.skipIf(!temBanco)('F1 — a view das matrículas', () => {
  /*
   * View sem `security_invoker` roda com os privilégios do **dono**, que no
   * Supabase é o `postgres` — e o `postgres` tem `BYPASSRLS`. A RLS de
   * `memberships` simplesmente não se aplica através dela, e os
   * `default privileges` do schema dão `select` ao `anon` automaticamente.
   *
   * O projeto já conhece o padrão certo: `staff_invites_public` (0020)
   * declara `security_invoker = true`. Esta view é de antes dele.
   */
  it('o anônimo não lê matrícula nenhuma', async () => {
    /*
     * Duas respostas servem, e a distinção importa menos do que parece: com
     * `security_invoker` a view passa a filtrar e devolve zero linhas; com o
     * `revoke` ela nega o acesso antes disso. A 0046 faz as duas coisas, e o
     * que o teste cobra é o resultado — o anônimo não leva matrícula.
     */
    const linhas = await asUser(client, null, `select * from student_active_memberships`).catch(
      (erro: { message: string }) => {
        expect(erro.message).toMatch(/permission denied/i)
        return []
      },
    )
    expect(linhas).toHaveLength(0)
  })

  it('e a academia Beta não lê as matrículas da Alpha', async () => {
    const linhas = await asUser<{ student_id: string }>(
      client,
      BETA.authId,
      `select * from student_active_memberships`,
    )
    const daAlpha = await client.query(`select id from students where organization_id = $1`, [
      ALPHA.orgId,
    ])
    const idsAlpha = new Set(daAlpha.rows.map((r) => r.id))
    expect(linhas.filter((l) => idsAlpha.has(l.student_id))).toHaveLength(0)
  })

  it('mas quem é da casa continua lendo a própria', async () => {
    // O controle: fechar a view para todo mundo também "passaria" nos dois
    // testes acima, e quebraria o produto.
    const linhas = await asUser(client, ALPHA.authId, `select * from student_active_memberships`)
    expect(linhas.length).toBeGreaterThan(0)
  })
})

describe.skipIf(!temBanco)('F2 — dado de saúde e a recepção', () => {
  /*
   * A 0004 listava os papéis um a um e deixava `RECEPTIONIST` de fora, com
   * comentário dizendo por quê. A 0008, que prometia só performance, trocou a
   * lista por `staff_organization_ids()` — que inclui a recepção. O filtro de
   * papel desapareceu sem ninguém notar.
   */
  it('a recepção não lê avaliação física', async () => {
    const linhas = await asUser(
      client,
      AUTH_RECEP_BETA,
      `select notes from assessments where organization_id = $1`,
      [BETA.orgId],
    )
    expect(linhas).toHaveLength(0)
  })

  it('nem apaga', async () => {
    await client.query(
      `insert into assessments (organization_id, student_id, weight)
       select $1, id, 80 from students where organization_id = $1 limit 1`,
      [BETA.orgId],
    )
    const { rows: antes } = await client.query(
      `select count(*)::int as n from assessments where organization_id = $1`,
      [BETA.orgId],
    )
    expect(antes[0].n).toBeGreaterThan(0) // o controle: havia o que apagar

    await asUser(client, AUTH_RECEP_BETA, `delete from assessments where organization_id = $1`, [
      BETA.orgId,
    ])

    const { rows: depois } = await client.query(
      `select count(*)::int as n from assessments where organization_id = $1`,
      [BETA.orgId],
    )
    expect(depois[0].n).toBe(antes[0].n)
  })

  it('mas o dono da academia continua lendo — a tela depende disso', async () => {
    const linhas = await asUser(
      client,
      ALPHA.authId,
      `select notes from assessments where organization_id = $1`,
      [ALPHA.orgId],
    )
    expect(linhas.length).toBeGreaterThan(0)
  })
})

describe.skipIf(!temBanco)('F3 — check-in em academia alheia', () => {
  it('o aluno da Alpha não insere check-in na Beta', async () => {
    await expect(
      asUser(
        client,
        AUTH_ALUNO_ALPHA,
        `insert into check_ins (organization_id, student_id) values ($1,$2)`,
        [BETA.orgId, alunoAlpha],
      ),
    ).rejects.toThrow()
  })

  it('mas insere na própria — o controle', async () => {
    await asUser(
      client,
      AUTH_ALUNO_ALPHA,
      `insert into check_ins (organization_id, student_id) values ($1,$2)`,
      [ALPHA.orgId, alunoAlpha],
    )
    const { rows } = await client.query(
      `select count(*)::int as n from check_ins where student_id = $1 and organization_id = $2`,
      [alunoAlpha, ALPHA.orgId],
    )
    expect(rows[0].n).toBeGreaterThan(0)
  })
})

describe.skipIf(!temBanco)('F4 — o paciente apagando a própria prescrição', () => {
  /*
   * `meals_scoped` é `for all` com um `using` que só confere "o plano
   * existe". Como a RLS do pai se aplica dentro da subconsulta, isso quer
   * dizer "o plano é visível para mim" — e o paciente vê o plano publicado.
   * O `update` morre no `with check`; o `delete` só consulta o `using`, e
   * passa.
   *
   * O que se perde é dado de saúde que a 0030 versiona de propósito, para
   * responder "o que ele estava comendo em agosto?".
   */
  let planoId: string
  let refeicaoId: string

  beforeAll(async () => {
    if (!temBanco) return
    const { rows: p } = await client.query(
      `insert into nutrition_plans (organization_id, student_id, author_staff_id, title, status)
       values ($1,$2,$3,'Plano da vítima','PUBLISHED') returning id`,
      [ALPHA.orgId, alunoAlpha, staffAlpha],
    )
    planoId = p[0].id
    const { rows: r } = await client.query(
      `insert into meals (nutrition_plan_id, name, time_of_day) values ($1,'Café','08:00') returning id`,
      [planoId],
    )
    refeicaoId = r[0].id
    await client.query(`insert into meal_items (meal_id, description) values ($1,'2 ovos')`, [
      refeicaoId,
    ])
  })

  it('o paciente lê o próprio plano', async () => {
    // O controle: a leitura tem que continuar funcionando.
    const linhas = await asUser(client, AUTH_ALUNO_ALPHA, `select name from meals where id = $1`, [
      refeicaoId,
    ])
    expect(linhas).toHaveLength(1)
  })

  it('e não apaga o item da refeição', async () => {
    await asUser(client, AUTH_ALUNO_ALPHA, `delete from meal_items where meal_id = $1`, [
      refeicaoId,
    ])
    const { rows } = await client.query(
      `select count(*)::int as n from meal_items where meal_id = $1`,
      [refeicaoId],
    )
    expect(rows[0].n).toBe(1)
  })

  it('nem a refeição', async () => {
    await asUser(client, AUTH_ALUNO_ALPHA, `delete from meals where id = $1`, [refeicaoId])
    const { rows } = await client.query(`select count(*)::int as n from meals where id = $1`, [
      refeicaoId,
    ])
    expect(rows[0].n).toBe(1)
  })
})

describe.skipIf(!temBanco)('F5 — corrida no feed de academia alheia', () => {
  it('o aluno da Alpha não grava atividade na Beta', async () => {
    await expect(
      asUser(
        client,
        AUTH_ALUNO_ALPHA,
        `insert into activities (user_profile_id, organization_id, sport, privacy, started_at)
         values ($1,$2,'RUN','GYM', now())`,
        [perfilAlunoAlpha, BETA.orgId],
      ),
    ).rejects.toThrow()
  })

  it('mas grava na própria, e sem academia nenhuma', async () => {
    // O controle: o Synse Run funciona para quem treina sozinho, sem vínculo.
    await asUser(
      client,
      AUTH_ALUNO_ALPHA,
      `insert into activities (user_profile_id, organization_id, sport, privacy, started_at)
       values ($1,$2,'RUN','PRIVATE', now())`,
      [perfilAlunoAlpha, ALPHA.orgId],
    )
    await asUser(
      client,
      AUTH_ALUNO_ALPHA,
      `insert into activities (user_profile_id, organization_id, sport, privacy, started_at)
       values ($1,null,'RUN','PRIVATE', now())`,
      [perfilAlunoAlpha],
    )
    const { rows } = await client.query(
      `select count(*)::int as n from activities where user_profile_id = $1`,
      [perfilAlunoAlpha],
    )
    expect(rows[0].n).toBe(2)
  })
})

describe.skipIf(!temBanco)('F7 — autorização de corpo por escrita direta', () => {
  /*
   * A 0045 existe para garantir que "só é possível autorizar quem a tela
   * oferece" — equipe ativa de uma academia da pessoa. Mas ela não revogou a
   * escrita da tabela, e `body_shares_owner` segue `for all`: um insert
   * direto pelo PostgREST contorna a função inteira.
   *
   * Atacante e vítima são a mesma pessoa, então o estrago é do próprio dono
   * do dado. O que se perde é a garantia — que custou uma migration.
   */
  it('não dá para autorizar alguém por insert direto', async () => {
    await expect(
      asUser(
        client,
        AUTH_ALUNO_ALPHA,
        `insert into body_measurement_shares (user_profile_id, shared_with_profile_id) values ($1,$2)`,
        [perfilAlunoAlpha, perfilFora],
      ),
    ).rejects.toThrow()
  })

  it('e a função continua sendo a porta que funciona', async () => {
    // O controle: fechar a tabela sem a função deixaria o produto sem o
    // recurso. A equipe da Alpha é autorizável porque o aluno é de lá.
    const { rows: dono } = await client.query(
      `select user_profile_id from organization_members
        where organization_id = $1 and role = 'OWNER' limit 1`,
      [ALPHA.orgId],
    )
    await client.query(
      `insert into staff (organization_id, user_profile_id, role, status)
       values ($1,$2,'TRAINER','ACTIVE') on conflict do nothing`,
      [ALPHA.orgId, dono[0].user_profile_id],
    )

    await asUser(client, AUTH_ALUNO_ALPHA, `select autorizar_corpo($1)`, [dono[0].user_profile_id])

    const { rows } = await client.query(
      `select count(*)::int as n from body_measurement_shares
        where user_profile_id = $1 and revoked_at is null`,
      [perfilAlunoAlpha],
    )
    expect(rows[0].n).toBe(1)
  })
})

describe.skipIf(!temBanco)('A1 — sequestro de conta por conversão de lead', () => {
  /*
   * O mais grave da auditoria. `convert_lead_to_student` é `security
   * definer`, procura `user_profiles` **por e-mail em todo o banco**, e cria
   * `students` com status ACTIVE. Nada confere que o dono daquele perfil quis
   * se matricular.
   *
   * Quem explora: qualquer pessoa com uma academia — e criar uma é
   * auto-serviço, `create_organization_with_owner` é concedida a todo
   * `authenticated`.
   *
   * O que ganha: o perfil da vítima vira aluno da academia dele. Isso abre a
   * PII inteira (nome, e-mail, telefone, CPF, nascimento) pela política
   * `user_profiles_visible`, permite gerar cobrança no nome dela, e — pior —
   * `resolveSession` escolhe a matrícula mais recente, então o app da vítima
   * passa a abrir **dentro da academia do atacante**.
   *
   * O contraste prova que é defeito, não desenho: o fluxo por código de
   * convite nasce PENDING de propósito, com um passo de confirmação.
   */
  it('converter lead com o e-mail de um estranho não o matricula', async () => {
    const { rows: lead } = await client.query(
      `insert into leads (organization_id, name, email, source)
       values ($1,'Isca','vitima@fora.test','OTHER') returning id`,
      [BETA.orgId],
    )

    await asUser(client, BETA.authId, `select convert_lead_to_student($1)`, [lead[0].id]).catch(
      () => undefined,
    )

    const { rows } = await client.query(
      `select count(*)::int as n from students
        where user_profile_id = $1 and organization_id = $2 and status = 'ACTIVE'`,
      [perfilFora, BETA.orgId],
    )
    expect(rows[0].n).toBe(0)
  })

  it('e o perfil da vítima continua invisível para o atacante', async () => {
    const linhas = await asUser(
      client,
      BETA.authId,
      `select email from user_profiles where id = $1`,
      [perfilFora],
    )
    expect(linhas).toHaveLength(0)
  })

  it('mas o lead de balcão, sem conta Synse, continua convertendo', async () => {
    /*
     * O controle, e o que a correção não pode quebrar: a recepção digita um
     * nome e um telefone de quem apareceu na porta, e converte. Esse caminho
     * cria perfil novo, e tem que seguir funcionando.
     */
    const { rows: lead } = await client.query(
      `insert into leads (organization_id, name, email, source)
       values ($1,'Pessoa do Balcão','balcao@novo.test','WALK_IN') returning id`,
      [BETA.orgId],
    )

    const r = await asUser<{ convert_lead_to_student: string }>(
      client,
      BETA.authId,
      `select convert_lead_to_student($1)`,
      [lead[0].id],
    )
    expect(r[0].convert_lead_to_student).toBeTruthy()
  })

  it('e converter lead sem e-mail nenhum também', async () => {
    // O caminho do `@synse.invalid`, que a 0028 criou de propósito.
    const { rows: lead } = await client.query(
      `insert into leads (organization_id, name, source)
       values ($1,'Sem E-mail','WALK_IN') returning id`,
      [BETA.orgId],
    )
    const r = await asUser<{ convert_lead_to_student: string }>(
      client,
      BETA.authId,
      `select convert_lead_to_student($1)`,
      [lead[0].id],
    )
    expect(r[0].convert_lead_to_student).toBeTruthy()
  })
})

describe.skipIf(!temBanco)('A2 — plano alimentar para aluno de outra academia', () => {
  /*
   * Usa o **segundo** aluno da Alpha, de propósito. Com o primeiro, o insert
   * do atacante colidia com `unique (student_id, version)` do plano criado no
   * F4 — e o teste passava por erro de chave, não por RLS. Vacuamente verde,
   * com o furo intacto. Conferido rodando o ataque isolado.
   */
  let outroAlunoAlpha: string

  beforeAll(async () => {
    if (!temBanco) return
    const { rows } = await client.query(
      `select id from students where organization_id = $1 order by id offset 1 limit 1`,
      [ALPHA.orgId],
    )
    outroAlunoAlpha = rows[0].id
  })

  /*
   * A política `nutrition_plans_professional` só confere `organization_id`,
   * que vem da sessão e portanto sempre passa. O `student_id` não é amarrado
   * a ela por nada — nem política, nem constraint, nem gatilho.
   *
   * E `publish_nutrition_plan` arquiva por `student_id` **sem filtrar
   * organização**: publicar o plano forjado arquiva o plano real da vítima.
   */
  it('a Beta não grava plano alimentar para aluno da Alpha', async () => {
    await expect(
      asUser(
        client,
        BETA.authId,
        `insert into nutrition_plans (organization_id, student_id, author_staff_id, title)
         values ($1,$2,$3,'Plano forjado')`,
        [BETA.orgId, outroAlunoAlpha, staffBeta],
      ),
    ).rejects.toThrow()
  })

  it('e o plano da vítima continua publicado', async () => {
    const { rows } = await client.query(
      `select count(*)::int as n from nutrition_plans
        where student_id = $1 and status = 'PUBLISHED'`,
      [alunoAlpha],
    )
    expect(rows[0].n).toBe(1)
  })

  it('mas a própria academia grava para o próprio aluno — o controle', async () => {
    const { rows: alunoB } = await client.query(
      `select id from students where organization_id = $1 limit 1`,
      [BETA.orgId],
    )
    await asUser(
      client,
      BETA.authId,
      `insert into nutrition_plans (organization_id, student_id, author_staff_id, title)
       values ($1,$2,$3,'Plano legítimo')`,
      [BETA.orgId, alunoB[0].id, staffBeta],
    )
    const { rows } = await client.query(
      `select count(*)::int as n from nutrition_plans where student_id = $1`,
      [alunoB[0].id],
    )
    expect(rows[0].n).toBe(1)
  })
})

describe.skipIf(!temBanco)('A3 — treino atribuído a aluno de outra academia', () => {
  it('a Beta não atribui treino a aluno da Alpha', async () => {
    const { rows: plano } = await client.query(
      `insert into workout_plans (organization_id, name) values ($1,'Treino da Beta') returning id`,
      [BETA.orgId],
    )
    await expect(
      asUser(
        client,
        BETA.authId,
        `insert into workout_assignments (organization_id, workout_plan_id, student_id)
         values ($1,$2,$3)`,
        [BETA.orgId, plano[0].id, alunoAlpha],
      ),
    ).rejects.toThrow()
  })

  it('mas atribui ao próprio aluno — o controle', async () => {
    const { rows: plano } = await client.query(
      `select id from workout_plans where organization_id = $1 limit 1`,
      [BETA.orgId],
    )
    const { rows: alunoB } = await client.query(
      `select id from students where organization_id = $1 limit 1`,
      [BETA.orgId],
    )
    await asUser(
      client,
      BETA.authId,
      `insert into workout_assignments (organization_id, workout_plan_id, student_id)
       values ($1,$2,$3)`,
      [BETA.orgId, plano[0].id, alunoB[0].id],
    )
    const { rows } = await client.query(
      `select count(*)::int as n from workout_assignments where student_id = $1`,
      [alunoB[0].id],
    )
    expect(rows[0].n).toBe(1)
  })
})

describe.skipIf(!temBanco)('A0 — auto-promoção a conta de plataforma', () => {
  /*
   * O pior furo da auditoria, e o mais curto de explicar:
   *
   * `organization_members_write` restringe **em qual academia** se escreve, e
   * não **qual papel** se grava. `is_super_admin()` aceita a linha em
   * qualquer organização. Logo, a dona de qualquer academia cliente vira
   * conta de plataforma com um `update` de uma linha — e o `PATCH`
   * equivalente está a um `curl` de distância, porque a chave anônima está no
   * pacote do navegador por desenho e o JWT está no cookie dela.
   *
   * O repositório acreditava que a porta estava fechada: `create_staff_invite`
   * recusa `SUPER_ADMIN`, `grant_super_admin` é revogada de `authenticated`, e
   * `super-admin.test.ts` tem um teste chamado "promover exige service_role —
   * o app não alcança". Esse teste prova que a **função** está fechada.
   * Ninguém tinha testado a escrita direta na tabela.
   */
  it('a dona da academia não se promove', async () => {
    const { rows: perfil } = await client.query(
      `select id from user_profiles where auth_user_id = $1`,
      [ALPHA.authId],
    )

    await asUser(
      client,
      ALPHA.authId,
      `update organization_members set role = 'SUPER_ADMIN'
        where user_profile_id = $1 and organization_id = $2`,
      [perfil[0].id, ALPHA.orgId],
    ).catch(() => undefined)

    const { rows } = await client.query(
      `select count(*)::int as n from organization_members
        where user_profile_id = $1 and role = 'SUPER_ADMIN'`,
      [perfil[0].id],
    )
    expect(rows[0].n).toBe(0)
  })

  it('e não enxerga a academia vizinha depois de tentar', async () => {
    const alunos = await asUser(
      client,
      ALPHA.authId,
      `select id from students where organization_id = $1`,
      [BETA.orgId],
    )
    expect(alunos).toHaveLength(0)
  })

  it('nem promove um cúmplice', async () => {
    // O `with check` só olhava a organização, então dava para promover
    // terceiro na própria academia do mesmo jeito.
    const { rows: outro } = await client.query(
      `insert into user_profiles (name, email) values ('Cúmplice','complice@teste.test')
       returning id`,
    )
    await asUser(
      client,
      ALPHA.authId,
      `insert into organization_members (organization_id, user_profile_id, role, status)
       values ($1,$2,'SUPER_ADMIN','ACTIVE')`,
      [ALPHA.orgId, outro[0].id],
    ).catch(() => undefined)

    const { rows } = await client.query(
      `select count(*)::int as n from organization_members where role = 'SUPER_ADMIN'`,
    )
    expect(rows[0].n).toBe(0)
  })

  it('mas continua administrando a própria equipe — o controle', async () => {
    // Fechar `organization_members` para tudo também passaria nos testes
    // acima, e tiraria da dona a capacidade de gerir a equipe dela.
    const { rows: novo } = await client.query(
      `insert into user_profiles (name, email) values ('Novo Professor','prof.novo@teste.test')
       returning id`,
    )
    await asUser(
      client,
      ALPHA.authId,
      `insert into organization_members (organization_id, user_profile_id, role, status)
       values ($1,$2,'TRAINER','ACTIVE')`,
      [ALPHA.orgId, novo[0].id],
    )
    const { rows } = await client.query(
      `select count(*)::int as n from organization_members
        where user_profile_id = $1 and role = 'TRAINER'`,
      [novo[0].id],
    )
    expect(rows[0].n).toBe(1)
  })
})
