import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ALPHA, applyMigrations, asUser, connect, databaseAvailable, seedTwoGyms } from './helpers'

/**
 * Inscrição de push (0040).
 *
 * ── Por que a tabela não tem política de leitura ────────────────────────────
 *
 * Porque o que ela guarda é **capacidade**, não informação: quem tem o
 * endpoint e as duas chaves escreve na tela de alguém. Não é credencial da
 * conta — não dá para entrar com ela —, mas é o suficiente para mandar
 * "sua mensalidade venceu" para o celular de um aluno que não é seu.
 *
 * Por isso metade destes testes é sobre quem **não** lê e quem **não** apaga.
 */

let client: Client
const temBanco = await databaseAvailable()

const AUTH_A = 'eeeeeeee-1111-1111-1111-111111111111'
const AUTH_B = 'eeeeeeee-2222-2222-2222-222222222222'
let perfilA: string
let perfilB: string

const ENDPOINT_A = 'https://fcm.googleapis.com/fcm/send/aparelho-da-pessoa-a'
const ENDPOINT_B = 'https://fcm.googleapis.com/fcm/send/aparelho-da-pessoa-b'

const registrar = (auth: string, endpoint: string, p256dh = 'chave-publica', autenticacao = 'segredo') =>
  asUser(client, auth, `select register_push_subscription($1, $2, $3, 'Navegador de Teste')`, [
    endpoint,
    p256dh,
    autenticacao,
  ])

const linhas = async () =>
  (
    await client.query<{ endpoint: string; user_profile_id: string; p256dh: string }>(
      `select endpoint, user_profile_id, p256dh from push_subscriptions order by endpoint`,
    )
  ).rows

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)
  await seedTwoGyms(client, 2)

  const { rows } = await client.query(
    `select user_profile_id from students where organization_id = $1 order by id limit 2`,
    [ALPHA.orgId],
  )
  perfilA = rows[0].user_profile_id
  perfilB = rows[1].user_profile_id

  for (const [auth, perfil, email] of [
    [AUTH_A, perfilA, 'a@alpha.test'],
    [AUTH_B, perfilB, 'b@alpha.test'],
  ] as const) {
    await client.query(`insert into auth.users (id, email) values ($1,$2)`, [auth, email])
    await client.query(`update user_profiles set auth_user_id = $1 where id = $2`, [auth, perfil])
  }
}, 60_000)

afterAll(async () => {
  await client?.end()
})

describe.skipIf(!temBanco)('registrar o aparelho', () => {
  it('guarda a inscrição da conta que pediu', async () => {
    await registrar(AUTH_A, ENDPOINT_A)

    const todas = await linhas()
    expect(todas).toHaveLength(1)
    expect(todas[0].user_profile_id).toBe(perfilA)
  })

  it('registrar de novo atualiza, não duplica', async () => {
    /*
     * O navegador troca o endpoint sozinho e chama isto de novo. Sem o
     * `on conflict`, a tabela cresceria uma linha por renovação e a pessoa
     * receberia o mesmo aviso várias vezes.
     */
    await registrar(AUTH_A, ENDPOINT_A, 'chave-nova')

    const todas = await linhas()
    expect(todas).toHaveLength(1)
    expect(todas[0].p256dh).toBe('chave-nova')
  })

  it('o mesmo aparelho em outra conta muda de dono', async () => {
    // Duas pessoas no mesmo celular: quem está logado agora é quem recebe.
    await registrar(AUTH_B, ENDPOINT_A)

    const todas = await linhas()
    expect(todas).toHaveLength(1)
    expect(todas[0].user_profile_id).toBe(perfilB)
  })

  it('o anônimo não registra nada', async () => {
    await expect(registrar(null as unknown as string, 'https://exemplo/anonimo')).rejects.toThrow()
    expect((await linhas()).every((l) => l.endpoint !== 'https://exemplo/anonimo')).toBe(true)
  })

  it('inscrição incompleta é recusada', async () => {
    await expect(registrar(AUTH_A, ENDPOINT_B, '', 'segredo')).rejects.toThrow(/incompleta/)
  })
})

describe.skipIf(!temBanco)('ninguém lê a tabela pela API', () => {
  it('nem a própria dona do aparelho', async () => {
    /*
     * Ela não precisa: o endpoint é do navegador dela, que já o conhece. E
     * poder listar abriria a porta para ler o dos outros se alguma política
     * futura errar a cláusula.
     */
    await registrar(AUTH_A, ENDPOINT_A)
    const suas = await asUser(client, AUTH_A, `select endpoint from push_subscriptions`)
    expect(suas).toHaveLength(0)
  })

  it('nem a dona da academia', async () => {
    const daDona = await asUser(client, ALPHA.authId, `select endpoint from push_subscriptions`)
    expect(daDona).toHaveLength(0)
  })

  it('nem o anônimo', async () => {
    const doAnonimo = await asUser(client, null, `select endpoint from push_subscriptions`)
    expect(doAnonimo).toHaveLength(0)
  })
})

describe.skipIf(!temBanco)('desligar o aviso', () => {
  it('apaga a própria inscrição', async () => {
    await registrar(AUTH_A, ENDPOINT_A)
    await asUser(client, AUTH_A, `select remove_push_subscription($1)`, [ENDPOINT_A])

    expect((await linhas()).every((l) => l.endpoint !== ENDPOINT_A)).toBe(true)
  })

  it('não apaga a inscrição de outra pessoa', async () => {
    /*
     * O teste que mais importa deste bloco. Conhecer o endpoint alheio é
     * exatamente o que um aparelho emprestado revela, e sem a cláusula de
     * dono isso bastaria para silenciar a conta de outra pessoa — que
     * deixaria de receber aviso de cobrança sem nunca saber por quê.
     */
    await registrar(AUTH_B, ENDPOINT_B)
    await asUser(client, AUTH_A, `select remove_push_subscription($1)`, [ENDPOINT_B])

    const todas = await linhas()
    expect(todas.some((l) => l.endpoint === ENDPOINT_B)).toBe(true)
  })
})

describe.skipIf(!temBanco)('a tela pergunta se este aparelho está ligado', () => {
  it('sim para o próprio, não para o alheio', async () => {
    await registrar(AUTH_A, ENDPOINT_A)

    const [proprio] = await asUser<{ has_push_subscription: boolean }>(
      client,
      AUTH_A,
      `select has_push_subscription($1)`,
      [ENDPOINT_A],
    )
    const [alheio] = await asUser<{ has_push_subscription: boolean }>(
      client,
      AUTH_A,
      `select has_push_subscription($1)`,
      [ENDPOINT_B],
    )

    expect(proprio.has_push_subscription).toBe(true)
    // Não é só "não é meu": é a resposta que impede usar esta função para
    // descobrir se um endpoint qualquer pertence a alguém no Synse.
    expect(alheio.has_push_subscription).toBe(false)
  })
})
