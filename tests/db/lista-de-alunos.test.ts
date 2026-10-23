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
 * ── A lista de alunos sem corte (0049) ──────────────────────────────────────
 *
 * `/alunos` mostra duas colunas que não vêm de `students`: "Próxima
 * mensalidade" e "Última presença". Elas eram montadas lendo `charges` e
 * `check_ins` **sem teto** para os alunos da página e guardando a primeira
 * linha de cada um na aplicação.
 *
 * O PostgREST corta a resposta no teto do servidor **sem dar erro**. Como os
 * check-ins vinham do mais recente para o mais antigo, o corte descartava a
 * presença mais velha: quem não aparece há meses chegava à tela com "Última
 * presença: —". E esse valor alimenta a aba "Sumidos", que existe justamente
 * para telefonar para quem parou de vir — então o corte fazia a aba listar
 * quem treinou ontem e esconder quem estava sumindo.
 *
 * ── O que estes testes protegem ─────────────────────────────────────────────
 *
 * 1. **Uma linha por aluno pedido**, não uma por check-in. É a asserção que
 *    mata o corte: não há volume de frequência que faça a resposta crescer.
 * 2. **A última presença é a última**, e a próxima mensalidade é a próxima em
 *    aberto — cobrança paga não é mensalidade a vencer.
 * 3. **A aba "Sumidos" decide sobre todos**, com o total junto, porque decidir
 *    sobre a página devolvia outra coisa e contava a academia inteira.
 * 4. **Uma academia não enxerga a outra**, nem passando o id dela.
 */

let client: Client
const temBanco = await databaseAvailable()

/**
 * Quatro alunos com histórias de frequência diferentes.
 *
 * `presencas` é quantos check-ins o aluno tem, e `ultimaHaDias` há quantos
 * dias foi o mais recente. O volume existe para provar o item 1: Teresa tem
 * sessenta presenças e ainda assim é uma linha na decoração.
 */
const ALUNOS: { nome: string; presencas: number; ultimaHaDias: number | null }[] = [
  { nome: 'Teresa Veloso', presencas: 60, ultimaHaDias: 200 }, // sumida de longa data
  { nome: 'Abel Moreira', presencas: 0, ultimaHaDias: null }, // nunca entrou
  { nome: 'Nadir Campos', presencas: 3, ultimaHaDias: 40 }, // sumida há pouco
  { nome: 'Olavo Prado', presencas: 5, ultimaHaDias: 2 }, // treinou esta semana
]

const porNome = new Map<string, string>()

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)
  await seedTwoGyms(client, 1)

  for (const aluno of ALUNOS) {
    const { rows: perfil } = await client.query(
      `insert into user_profiles (name, email) values ($1,$2) returning id`,
      [aluno.nome, `${aluno.nome.replace(/\s/g, '.').toLowerCase()}@lista.test`],
    )
    const { rows: matricula } = await client.query(
      `insert into students (organization_id, user_profile_id, status)
       values ($1, $2, 'ACTIVE') returning id`,
      [ALPHA.orgId, perfil[0].id],
    )
    const id = matricula[0].id
    porNome.set(aluno.nome, id)

    /*
     * As presenças vão da mais antiga para a mais recente, terminando em
     * `ultimaHaDias`. Com mais de uma, a função precisa pegar a última — com
     * uma só, um `distinct on` com a ordem invertida passaria sem provar nada.
     */
    for (let i = 0; i < aluno.presencas; i += 1) {
      const diasAtras = (aluno.ultimaHaDias ?? 0) + (aluno.presencas - 1 - i) * 7
      await client.query(
        `insert into check_ins (organization_id, student_id, checked_in_at)
         values ($1, $2, now() - make_interval(days => $3::int))`,
        [ALPHA.orgId, id, diasAtras],
      )
    }
  }

  /*
   * Teresa tem três cobranças: uma já paga, uma vencida e uma a vencer. A
   * "próxima mensalidade" é a vencida — a mais próxima entre as em aberto —, e
   * a paga não pode aparecer.
   */
  await client.query(
    `insert into charges (organization_id, student_id, description, amount, due_date, status)
     values ($1,$2,'Paga',100,current_date - 90,'PAID'),
            ($1,$2,'Vencida',111.5,current_date - 10,'OVERDUE'),
            ($1,$2,'A vencer',222,current_date + 20,'PENDING')`,
    [ALPHA.orgId, porNome.get('Teresa Veloso')],
  )
}, 60_000)

afterAll(async () => {
  await client?.end()
})

type Decoracao = {
  student_id: string
  next_charge_due_date: string | null
  next_charge_amount: string | null
  last_check_in_at: string | null
}

const decorar = (ids: string[], authId: string | null = ALPHA.authId, orgId = ALPHA.orgId) =>
  asUser<Decoracao>(client, authId, `select * from decoracao_dos_alunos($1, $2)`, [orgId, ids])

const sumidos = (
  args: {
    dias?: number
    busca?: string | null
    trainerId?: string | null
    planId?: string | null
    limite?: number
    deslocamento?: number
  } = {},
  authId: string | null = ALPHA.authId,
  orgId = ALPHA.orgId,
) =>
  asUser<{ student_id: string; total_geral: string }>(
    client,
    authId,
    `select * from alunos_dormentes($1, $2, $3, $4, $5, $6, $7)`,
    [
      orgId,
      args.dias ?? 21,
      args.busca ?? null,
      args.trainerId ?? null,
      args.planId ?? null,
      args.limite ?? 20,
      args.deslocamento ?? 0,
    ],
  )

describe.skipIf(!temBanco)('a decoração da página', () => {
  it('devolve uma linha por aluno pedido, não uma por presença', async () => {
    /*
     * A asserção central. Teresa tem 60 check-ins, Olavo 5, Nadir 3 e Abel
     * nenhum: 68 linhas no caminho antigo, que era o que podia ser cortado.
     * Aqui são quatro — o número de alunos da página, e nada mais.
     */
    const ids = ALUNOS.map((a) => porNome.get(a.nome)!)
    const linhas = await decorar(ids)

    expect(linhas).toHaveLength(ids.length)
    expect(new Set(linhas.map((l) => l.student_id)).size).toBe(ids.length)
  })

  it('a última presença é a última, e não a primeira que achar', async () => {
    const [teresa] = await decorar([porNome.get('Teresa Veloso')!])

    /*
     * A mais antiga de Teresa está a 200 + 59×7 = 613 dias. Se o `distinct on`
     * pegasse a errada, a diferença passaria de seiscentos dias — e é
     * exatamente esse erro que fazia a aba "Sumidos" mentir.
     */
    const diasAtras = Math.round(
      (Date.now() - new Date(teresa.last_check_in_at!).getTime()) / 86_400_000,
    )
    expect(diasAtras).toBeGreaterThanOrEqual(199)
    expect(diasAtras).toBeLessThanOrEqual(201)
  })

  it('quem nunca entrou vem com presença nula, e continua vindo', async () => {
    /*
     * Dois erros possíveis aqui, e o teste separa os dois: o aluno sem
     * check-in pode vir com data errada, ou pode simplesmente **não vir** —
     * se a junção fosse interna, ele desapareceria da página de alunos.
     */
    const [abel] = await decorar([porNome.get('Abel Moreira')!])

    expect(abel).toBeDefined()
    expect(abel.last_check_in_at).toBeNull()
  })

  it('a próxima mensalidade é a mais próxima em aberto, e nunca uma paga', async () => {
    const [teresa] = await decorar([porNome.get('Teresa Veloso')!])

    // A vencida (há 10 dias) vem antes da a vencer (em 20) — e a paga, nunca.
    expect(Number(teresa.next_charge_amount)).toBe(111.5)
  })

  it('aluno sem cobrança em aberto vem com mensalidade nula', async () => {
    /*
     * O aluno da semente tem uma cobrança, mas `PAID`. Se o filtro de status
     * caísse, ele apareceria na tela com uma mensalidade que já foi paga —
     * pior que coluna vazia, porque parece cobrança a fazer.
     */
    const [semente] = await asUser<{ id: string }>(
      client,
      ALPHA.authId,
      `select s.id from students s join user_profiles p on p.id = s.user_profile_id
        where s.organization_id = $1 and p.name = 'Aluno a1'`,
      [ALPHA.orgId],
    )
    const [linha] = await decorar([semente.id])

    expect(linha.next_charge_due_date).toBeNull()
    expect(linha.next_charge_amount).toBeNull()
  })
})

describe.skipIf(!temBanco)('a aba Sumidos', () => {
  it('lista quem não aparece há 21 dias, e quem nunca apareceu', async () => {
    const ids = (await sumidos()).map((l) => l.student_id)

    expect(ids).toContain(porNome.get('Abel Moreira')) // nunca entrou
    expect(ids).toContain(porNome.get('Teresa Veloso')) // 200 dias
    expect(ids).toContain(porNome.get('Nadir Campos')) // 40 dias
    // Olavo treinou há 2 dias, e o aluno da semente entrou agora.
    expect(ids).not.toContain(porNome.get('Olavo Prado'))
  })

  it('a ordem é a da urgência: quem nunca veio, depois do mais antigo', async () => {
    const ids = (await sumidos()).map((l) => l.student_id)

    expect(ids).toEqual([
      porNome.get('Abel Moreira'), // nunca veio
      porNome.get('Teresa Veloso'), // 200 dias
      porNome.get('Nadir Campos'), // 40 dias
    ])
  })

  it('o total é o de todos os sumidos, e não o da página', async () => {
    /*
     * O defeito que isto tranca: o rodapé lia o `count` da consulta sem
     * filtro, então a tela dizia o tamanho da academia e mostrava três linhas.
     */
    const umaPagina = await sumidos({ limite: 1 })

    expect(umaPagina).toHaveLength(1)
    expect(Number(umaPagina[0].total_geral)).toBe(3)
  })

  it('paginar não repete nem perde ninguém', async () => {
    const todos = (await sumidos()).map((l) => l.student_id)

    const pedaços: string[] = []
    for (let i = 0; i < todos.length; i += 2) {
      pedaços.push(...(await sumidos({ limite: 2, deslocamento: i })).map((l) => l.student_id))
    }

    expect(pedaços).toEqual(todos)
    expect(new Set(pedaços).size).toBe(todos.length)
  })

  it('a busca recorta antes de contar', async () => {
    /*
     * Buscar e só então contar é o que a aplicação não conseguia fazer: lá a
     * busca e o filtro de sumido viviam em passos diferentes, um antes e um
     * depois da paginação.
     */
    const achados = await sumidos({ busca: 'teresa' })

    expect(achados).toHaveLength(1)
    expect(achados[0].student_id).toBe(porNome.get('Teresa Veloso'))
    expect(Number(achados[0].total_geral)).toBe(1)
  })

  it('o filtro de plano olha o plano, e não se existe algum', async () => {
    /*
     * Este é o terceiro defeito da tela: na aplicação o recorte por plano era
     * `planName != null` — "tem algum plano" —, então escolher "Mensal" trazia
     * quem estava no trimestral. Aqui Teresa está no Mensal e Nadir no
     * Trimestral, e pedir um não pode trazer o outro.
     */
    const { rows: mensal } = await client.query(
      `select id from membership_plans where organization_id = $1 and name = 'Mensal'`,
      [ALPHA.orgId],
    )
    const { rows: trimestral } = await client.query(
      `insert into membership_plans (organization_id, name, price, billing_cycle)
       values ($1,'Trimestral',299,'QUARTERLY') returning id`,
      [ALPHA.orgId],
    )
    await client.query(
      `insert into memberships (organization_id, student_id, plan_id, price, billing_day)
       values ($1,$2,$3,109.9,5), ($1,$4,$5,299,5)`,
      [
        ALPHA.orgId,
        porNome.get('Teresa Veloso'),
        mensal[0].id,
        porNome.get('Nadir Campos'),
        trimestral[0].id,
      ],
    )

    const noMensal = await sumidos({ planId: mensal[0].id })
    const ids = noMensal.map((l) => l.student_id)

    expect(ids).toContain(porNome.get('Teresa Veloso'))
    expect(ids).not.toContain(porNome.get('Nadir Campos'))
    // Abel não tem matrícula nenhuma: filtro de plano o exclui, não o deixa passar.
    expect(ids).not.toContain(porNome.get('Abel Moreira'))
    expect(Number(noMensal[0].total_geral)).toBe(1)
  })
})

describe.skipIf(!temBanco)('o isolamento', () => {
  it('a vizinha não enxerga a presença dos alunos daqui', async () => {
    /*
     * `security invoker`: quem filtra é a RLS de `check_ins` e `charges`, não
     * um `where` que alguém pode esquecer. A linha volta — o aluno foi pedido
     * —, mas vazia: a dona da Beta não sabe quando o aluno da Alpha treinou.
     */
    const [linha] = await decorar([porNome.get('Teresa Veloso')!], BETA.authId, BETA.orgId)

    expect(linha.last_check_in_at).toBeNull()
    expect(linha.next_charge_amount).toBeNull()
  })

  it('nem passando o id da academia daqui', async () => {
    const [linha] = await decorar([porNome.get('Teresa Veloso')!], BETA.authId, ALPHA.orgId)
    expect(linha.last_check_in_at).toBeNull()
  })

  it('a lista de sumidos da vizinha não vaza', async () => {
    const alheia = await sumidos({}, BETA.authId, ALPHA.orgId)
    expect(alheia).toHaveLength(0)
  })

  it('o anônimo não executa nenhuma das duas', async () => {
    await expect(decorar([porNome.get('Teresa Veloso')!], null)).rejects.toThrow(
      /permission denied|permissão/i,
    )
    await expect(sumidos({}, null)).rejects.toThrow(/permission denied|permissão/i)
  })
})
