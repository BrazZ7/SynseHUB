import { describe, expect, it } from 'vitest'

import { DemoDataSource } from '@/lib/database/demo-data-source'
import { DEMO_ORG_ID } from '@/lib/database/demo-seed'
import { clienteFalso } from '../postgrest-falso'

/**
 * ── As cobranças de um aluno ────────────────────────────────────────────────
 *
 * `getChargesForStudent` lia o histórico inteiro, sem teto, ordenado do
 * vencimento mais novo para o mais antigo — e respondia por três perguntas
 * diferentes:
 *
 *   qual cobrança o aluno paga agora        (a mais antiga em aberto)
 *   esta cobrança de id X é dele?           (a action do PIX, por varredura)
 *   o que já foi pago                       (as últimas doze)
 *
 * O PostgREST corta a resposta no teto do servidor sem dar erro, e o corte
 * descarta o **fim** da ordem: o vencimento mais antigo. As duas primeiras
 * perguntas são justamente sobre o mais antigo — o aluno quitando uma dívida
 * velha recebia "cobrança não encontrada" para algo que a tela mostrava a
 * ele, e a tela oferecia pagar a cobrança errada.
 *
 * E havia um segundo defeito, independente do corte: a mesma pergunta era
 * respondida de dois jeitos. A ficha no painel fazia `find` sobre a ordem
 * decrescente e pegava a **mais nova** em aberto; o app ordenava de novo e
 * pegava a **mais antiga**. Aluno com dois meses atrasados ouvia um valor na
 * recepção e via outro no celular.
 */

const fonte = () => new DemoDataSource([])

/** Um aluno da semente com histórico e cobrança em aberto. */
async function alunoComHistorico() {
  const f = fonte()
  const { rows } = await f.listStudents(DEMO_ORG_ID, { pageSize: 100, status: 'ALL' })
  for (const aluno of rows) {
    const historico = await f.getChargesForStudent(DEMO_ORG_ID, aluno.id, { pageSize: 200 })
    if (historico.total >= 3) return { f, alunoId: aluno.id, historico }
  }
  throw new Error('a semente não tem aluno com histórico de cobrança')
}

describe('o histórico, na demonstração', () => {
  it('vem do vencimento mais novo para o mais antigo', async () => {
    const { historico } = await alunoComHistorico()
    const datas = historico.rows.map((c) => c.dueDate)

    expect([...datas].sort().reverse()).toEqual(datas)
  })

  it('recorta e só então conta: o total é do filtro', async () => {
    const { f, alunoId, historico } = await alunoComHistorico()
    const pagas = await f.getChargesForStudent(DEMO_ORG_ID, alunoId, {
      status: 'PAID',
      pageSize: 200,
    })

    expect(pagas.rows.every((c) => c.status === 'PAID')).toBe(true)
    expect(pagas.total).toBe(pagas.rows.length)
    // O controle: há cobrança não paga no histórico, então o filtro recortou
    // algo. Sem isto o teste passaria com um filtro que não filtra.
    expect(pagas.total).toBeLessThan(historico.total)
  })

  it('paginar não repete nem perde ninguém', async () => {
    const { f, alunoId, historico } = await alunoComHistorico()
    const todas = historico.rows.map((c) => c.id)

    const pedaços: string[] = []
    for (let pagina = 1; pedaços.length < todas.length; pagina += 1) {
      const { rows } = await f.getChargesForStudent(DEMO_ORG_ID, alunoId, {
        page: pagina,
        pageSize: 5,
      })
      if (rows.length === 0) break
      pedaços.push(...rows.map((c) => c.id))
    }

    expect(pedaços).toEqual(todas)
    expect(new Set(pedaços).size).toBe(todas.length)
  })

  it('não mostra cobrança de outro aluno', async () => {
    const { f, alunoId } = await alunoComHistorico()
    const { rows } = await f.listStudents(DEMO_ORG_ID, { pageSize: 100, status: 'ALL' })
    const outro = rows.find((aluno) => aluno.id !== alunoId)!

    const minhas = await f.getChargesForStudent(DEMO_ORG_ID, alunoId, { pageSize: 200 })
    const dele = await f.getChargesForStudent(DEMO_ORG_ID, outro.id, { pageSize: 200 })

    expect(minhas.rows.every((c) => c.studentId === alunoId)).toBe(true)
    const ids = new Set(dele.rows.map((c) => c.id))
    expect(minhas.rows.some((c) => ids.has(c.id))).toBe(false)
  })
})

describe('a cobrança que a pessoa paga agora', () => {
  it('é a mais antiga em aberto, para todos os alunos da semente', async () => {
    /*
     * Varre a academia inteira em vez de olhar um aluno, por um motivo
     * concreto: a maioria tem **uma** cobrança em aberto, e com uma só "a mais
     * antiga" e "a mais nova" são a mesma linha — o teste passaria com a regra
     * errada. A distinção só aparece em quem tem duas.
     *
     * `comDuasEmAberto` conta quantos alunos puderam distinguir as duas
     * regras. Se um dia der zero, a asserção final avisa que a semente mudou e
     * este teste parou de provar o que diz provar — em vez de continuar verde
     * sem olhar nada.
     */
    const f = fonte()
    const { rows } = await f.listStudents(DEMO_ORG_ID, { pageSize: 100, status: 'ALL' })

    let comDuasEmAberto = 0
    for (const aluno of rows) {
      const historico = await f.getChargesForStudent(DEMO_ORG_ID, aluno.id, { pageSize: 200 })
      const emAberto = historico.rows.filter(
        (c) => c.status === 'PENDING' || c.status === 'OVERDUE',
      )
      const aberta = await f.getNextOpenCharge(DEMO_ORG_ID, aluno.id)

      if (emAberto.length === 0) {
        expect(aberta).toBeNull()
        continue
      }
      if (emAberto.length >= 2) comDuasEmAberto += 1

      const maisAntiga = [...emAberto].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]
      expect(aberta?.id).toBe(maisAntiga.id)
    }

    expect(comDuasEmAberto).toBeGreaterThan(0)
  })

  it('nunca oferece uma cobrança cancelada', async () => {
    /*
     * Cancelada não é dívida: oferecer para pagar cobraria de novo algo que a
     * academia desfez. O filtro é `PENDING`/`OVERDUE`, e não "qualquer coisa
     * que não esteja paga" — a diferença entre os dois é esta asserção.
     */
    const f = fonte()
    const { rows } = await f.listStudents(DEMO_ORG_ID, { pageSize: 100, status: 'ALL' })

    let comCancelada = 0
    for (const aluno of rows) {
      const historico = await f.getChargesForStudent(DEMO_ORG_ID, aluno.id, { pageSize: 200 })
      if (!historico.rows.some((c) => c.status === 'CANCELLED')) continue
      comCancelada += 1

      const aberta = await f.getNextOpenCharge(DEMO_ORG_ID, aluno.id)
      if (aberta) expect(aberta.status).not.toBe('CANCELLED')
    }

    // O controle: sem nenhuma cancelada na semente o teste acima não olha nada.
    expect(comCancelada).toBeGreaterThan(0)
  })

  it('aluno sem nada em aberto devolve nulo, e não a última paga', async () => {
    const { f, alunoId, historico } = await alunoComHistorico()

    for (const cobranca of historico.rows) {
      if (cobranca.status !== 'PAID') {
        await f.markChargeAsPaid(DEMO_ORG_ID, cobranca.id, {
          method: 'PIX',
          paidAt: new Date().toISOString(),
        })
      }
    }

    expect(await f.getNextOpenCharge(DEMO_ORG_ID, alunoId)).toBeNull()
  })
})

describe('a cobrança por id', () => {
  it('acha a do próprio aluno', async () => {
    const { f, alunoId, historico } = await alunoComHistorico()
    const alvo = historico.rows[1]

    const achada = await f.getStudentCharge(DEMO_ORG_ID, alunoId, alvo.id)
    expect(achada?.id).toBe(alvo.id)
  })

  it('recusa a de outro aluno, mesmo com o id certo', async () => {
    /*
     * É aqui que mora a conferência de dono da action do PIX: com um `null`
     * ela recusa, com a cobrança ela gera um PIX no valor da dívida de outra
     * pessoa. Antes a conferência era um `find` sobre a lista lida — e quem
     * lia a lista do aluno certo nunca veria o id do outro, mas a regra ficava
     * implícita na leitura em vez de explícita na consulta.
     */
    const { f, alunoId, historico } = await alunoComHistorico()
    const { rows } = await f.listStudents(DEMO_ORG_ID, { pageSize: 100, status: 'ALL' })
    const outro = rows.find((aluno) => aluno.id !== alunoId)!

    const alheia = await f.getStudentCharge(DEMO_ORG_ID, outro.id, historico.rows[0].id)
    expect(alheia).toBeNull()
  })

  it('id que não existe devolve nulo', async () => {
    const { f, alunoId } = await alunoComHistorico()
    expect(await f.getStudentCharge(DEMO_ORG_ID, alunoId, 'chr_nao_existe')).toBeNull()
  })
})

describe('o que o caminho do Supabase pede', () => {
  const COBRANCA = {
    id: 'chr-1',
    organization_id: 'org-1',
    student_id: 'stu-1',
    membership_id: null,
    description: 'Mensalidade',
    amount: '109.90',
    due_date: '2026-08-05',
    status: 'OVERDUE',
    payment_method: null,
    paid_at: null,
    provider: null,
    provider_charge_id: null,
  }

  it('a cobrança em aberto é pedida ao banco: mais antiga, uma linha', async () => {
    /*
     * As três cláusulas juntas **são** a correção. `ascending: true` é a que
     * acaba com a divergência entre a recepção e o celular, e `limit(1)` com
     * `maybeSingle()` é o que faz a resposta não ter o que cortar.
     */
    const t = clienteFalso({ tabelas: { charges: [{ data: COBRANCA, error: null }] } })

    const aberta = await t.dataSource.getNextOpenCharge('org-1', 'stu-1')

    const passos = t.paraTabela('charges')!.passos
    expect(passos).toEqual(
      expect.arrayContaining([
        { metodo: 'in', args: ['status', ['PENDING', 'OVERDUE']] },
        { metodo: 'order', args: ['due_date', { ascending: true }] },
        { metodo: 'limit', args: [1] },
        { metodo: 'maybeSingle', args: [] },
      ]),
    )
    expect(aberta?.id).toBe('chr-1')
    expect(aberta?.amount).toBe(109.9)
  })

  it('a cobrança por id leva a academia e o aluno na própria consulta', async () => {
    const t = clienteFalso({ tabelas: { charges: [{ data: COBRANCA, error: null }] } })

    await t.dataSource.getStudentCharge('org-1', 'stu-1', 'chr-1')

    expect(t.paraTabela('charges')!.passos).toEqual(
      expect.arrayContaining([
        { metodo: 'eq', args: ['organization_id', 'org-1'] },
        { metodo: 'eq', args: ['student_id', 'stu-1'] },
        { metodo: 'eq', args: ['id', 'chr-1'] },
        { metodo: 'maybeSingle', args: [] },
      ]),
    )
  })

  it('o histórico pede faixa e traz o total do filtro', async () => {
    const t = clienteFalso({
      tabelas: { charges: [{ data: [COBRANCA], error: null, count: 137 }] },
    })

    const r = await t.dataSource.getChargesForStudent('org-1', 'stu-1', {
      status: 'PAID',
      page: 2,
      pageSize: 12,
    })

    expect(t.paraTabela('charges')!.passos).toEqual(
      expect.arrayContaining([
        { metodo: 'eq', args: ['status', 'PAID'] },
        { metodo: 'order', args: ['due_date', { ascending: false }] },
        { metodo: 'range', args: [12, 23] },
      ]),
    )
    // 137 é o total do filtro, vindo do `count: 'exact'`.
    expect(r.total).toBe(137)
    expect(r.page).toBe(2)
  })

  it('status "ALL" não vira uma cláusula de status', async () => {
    const t = clienteFalso({ tabelas: { charges: [{ data: [], error: null, count: 0 }] } })

    await t.dataSource.getChargesForStudent('org-1', 'stu-1', { status: 'ALL' })

    const statusFiltrado = t
      .paraTabela('charges')!
      .passos.some((p) => p.metodo === 'eq' && p.args[0] === 'status')
    expect(statusFiltrado).toBe(false)
  })
})
