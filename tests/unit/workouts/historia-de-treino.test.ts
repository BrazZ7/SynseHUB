import { describe, expect, it } from 'vitest'

import { DemoDataSource } from '@/lib/database/demo-data-source'
import { DEMO_ORG_ID } from '@/lib/database/demo-seed'
import { clienteFalso } from '../postgrest-falso'

/**
 * ── O histórico de treino ───────────────────────────────────────────────────
 *
 * `listWorkoutLogs` lia a tabela inteira de um aluno, sem teto, em ordem
 * **crescente** de data. O PostgREST corta a resposta no teto do servidor sem
 * dar erro, e numa ordem crescente o corte descarta o registro **mais
 * recente** — o oposto do que se perde nas outras leituras deste projeto.
 *
 * Três coisas se alimentavam dela, e erravam de jeitos diferentes:
 *
 *   o "ganho de carga" da home     usa a última carga → congelava num valor antigo
 *   o cartão "Treinos"             conta as linhas    → dizia menos do que é
 *   os dois gráficos de carga      um ponto por linha → paravam antes do presente
 *
 * As duas primeiras saíram para consultas próprias. O gráfico ficou com a
 * janela que a tela já anuncia ao lado.
 */

const fonte = () => new DemoDataSource([])

/** Um aluno da semente com histórico de treino. */
async function alunoComTreino() {
  const f = fonte()
  const { rows } = await f.listStudents(DEMO_ORG_ID, { pageSize: 100, status: 'ALL' })
  for (const aluno of rows) {
    const total = await f.countWorkoutLogs(DEMO_ORG_ID, aluno.id)
    if (total >= 3) return { f, alunoId: aluno.id, total }
  }
  throw new Error('a semente não tem aluno com histórico de treino')
}

describe('a contagem, na demonstração', () => {
  it('a janela pedida recorta; a contagem é outra pergunta', async () => {
    /*
     * ── O que este teste NÃO prova, e onde isso é provado ─────────────────
     *
     * "A contagem conta tudo, não a janela" não é verificável aqui: nenhum
     * aluno da semente tem registro além de noventa dias, então a janela
     * padrão e o histórico inteiro são o **mesmo conjunto**. A mutação que
     * troca a contagem por `listWorkoutLogs().length` passa por este arquivo
     * sem quebrar nada — conferi.
     *
     * A asserção que pega isso está no caminho do Supabase, lá embaixo: a
     * consulta de contagem não pode levar filtro de data. É onde o dado de
     * verdade vai ter dez anos de histórico.
     *
     * O que dá para provar aqui é o recorte: janela no futuro devolve zero, e
     * a contagem continua maior que zero.
     */
    const { f, alunoId, total } = await alunoComTreino()

    const amanha = new Date(Date.now() + 86_400_000).toISOString()
    const janelaVazia = await f.listWorkoutLogs(DEMO_ORG_ID, alunoId, { since: amanha })

    expect(janelaVazia).toHaveLength(0)
    expect(total).toBeGreaterThan(0)
  })

  it('a janela recorta por data', async () => {
    const { f, alunoId } = await alunoComTreino()
    const tudo = await f.listWorkoutLogs(DEMO_ORG_ID, alunoId, {
      since: new Date(0).toISOString(),
    })
    const semana = await f.listWorkoutLogs(DEMO_ORG_ID, alunoId, {
      since: new Date(Date.now() - 7 * 86_400_000).toISOString(),
    })

    expect(semana.length).toBeLessThan(tudo.length)
    for (const log of semana) {
      expect(log.performedAt >= new Date(Date.now() - 8 * 86_400_000).toISOString()).toBe(true)
    }
  })

  it('o que volta continua em ordem crescente', async () => {
    // A ordem é o que o gráfico desenha: invertê-la vira a linha do avesso.
    const { f, alunoId } = await alunoComTreino()
    const logs = await f.listWorkoutLogs(DEMO_ORG_ID, alunoId, {
      since: new Date(0).toISOString(),
    })
    const datas = logs.map((l) => l.performedAt)

    expect([...datas].sort()).toEqual(datas)
  })
})

describe('a primeira e a última carga', () => {
  it('são as pontas do histórico inteiro, não da janela', async () => {
    /*
     * A asserção central. A home usa estas duas para o "ganho de carga", e o
     * corte levava a última — então o número congelava. Aqui elas são
     * comparadas com o histórico inteiro, sem janela.
     */
    const { f, alunoId } = await alunoComTreino()
    const tudo = (
      await f.listWorkoutLogs(DEMO_ORG_ID, alunoId, { since: new Date(0).toISOString() })
    ).filter((l) => l.load != null)

    const cargas = await f.getLoadProgress(DEMO_ORG_ID, alunoId)

    expect(tudo.length).toBeGreaterThan(1)
    expect(cargas.primeira).toBe(tudo[0].load)
    expect(cargas.ultima).toBe(tudo[tudo.length - 1].load)
  })

  it('aluno sem carga registrada devolve nulo, não zero', async () => {
    /*
     * Zero é uma carga; nulo é "não há registro". A tela mostra "—" para nulo
     * e "+0,0 kg" para zero, e as duas frases dizem coisas diferentes.
     */
    const f = fonte()
    const cargas = await f.getLoadProgress(DEMO_ORG_ID, 'stu_nao_existe')

    expect(cargas.primeira).toBeNull()
    expect(cargas.ultima).toBeNull()
  })
})

describe('o que o caminho do Supabase pede', () => {
  const LOG = {
    id: 'log-1',
    organization_id: 'org-1',
    student_id: 'stu-1',
    workout_plan_id: null,
    workout_exercise_id: 'ex-1',
    performed_at: '2026-09-20T10:00:00.000Z',
    load: '62.50',
    reps: 10,
    sets: 3,
    rpe: 7,
    notes: null,
  }

  it('o gráfico pede janela e teto', async () => {
    const t = clienteFalso({ tabelas: { workout_logs: [{ data: [LOG], error: null }] } })

    await t.dataSource.listWorkoutLogs('org-1', 'stu-1')

    const passos = t.paraTabela('workout_logs')!.passos
    const janela = passos.find((p) => p.metodo === 'gte' && p.args[0] === 'performed_at')
    expect(janela).toBeDefined()
    expect(passos).toEqual(
      expect.arrayContaining([
        { metodo: 'order', args: ['performed_at', { ascending: true }] },
        { metodo: 'limit', args: [500] },
      ]),
    )
  })

  it('a janela padrão são os noventa dias que a tela anuncia', async () => {
    const t = clienteFalso({ tabelas: { workout_logs: [{ data: [], error: null }] } })

    await t.dataSource.listWorkoutLogs('org-1', 'stu-1')

    const janela = t
      .paraTabela('workout_logs')!
      .passos.find((p) => p.metodo === 'gte' && p.args[0] === 'performed_at')!
    const dias = (Date.now() - new Date(String(janela.args[1])).getTime()) / 86_400_000

    expect(Math.round(dias)).toBe(90)
  })

  it('a contagem não traz linha nenhuma, e não leva filtro de data', async () => {
    /*
     * As duas metades importam. `head: true` é o que faz a contagem não ter o
     * que cortar; a **ausência** de filtro de data é o que separa "quantos
     * registros o aluno tem" de "quantos nos últimos noventa dias". Com a
     * data, o cartão encolheria sozinho com o tempo sem nada ter mudado.
     *
     * Esta é a asserção que a demonstração não consegue fazer, porque na
     * semente a janela e o histórico inteiro são o mesmo conjunto.
     */
    const t = clienteFalso({ tabelas: { workout_logs: [{ data: null, error: null, count: 412 }] } })

    const total = await t.dataSource.countWorkoutLogs('org-1', 'stu-1')

    expect(total).toBe(412)
    const passos = t.paraTabela('workout_logs')!.passos
    expect(passos.find((p) => p.metodo === 'select')!.args[1]).toEqual({
      count: 'exact',
      head: true,
    })
    expect(passos.some((p) => p.metodo === 'gte' || p.metodo === 'lte')).toBe(false)
    expect(passos.some((p) => p.metodo === 'limit' || p.metodo === 'range')).toBe(false)
  })

  it('as duas cargas saem de duas consultas de uma linha, em ordens opostas', async () => {
    /*
     * As duas ordens juntas **são** o conserto: `asc` dá a primeira, `desc` a
     * última, e `limit(1)` faz cada resposta não ter o que cortar. Pedir as
     * duas na mesma ordem devolveria a mesma linha duas vezes e o ganho seria
     * sempre zero.
     */
    const t = clienteFalso({
      tabelas: {
        workout_logs: [
          { data: { load: '40.00' }, error: null },
          { data: { load: '62.50' }, error: null },
        ],
      },
    })

    const cargas = await t.dataSource.getLoadProgress('org-1', 'stu-1')

    expect(cargas).toEqual({ primeira: 40, ultima: 62.5 })

    const ordens = t
      .todasParaTabela('workout_logs')
      .map((c) => c.passos.find((p) => p.metodo === 'order')!.args[1])
    expect(ordens).toEqual([{ ascending: true }, { ascending: false }])

    for (const chamada of t.todasParaTabela('workout_logs')) {
      expect(chamada.passos).toEqual(
        expect.arrayContaining([
          { metodo: 'not', args: ['load', 'is', null] },
          { metodo: 'limit', args: [1] },
        ]),
      )
    }
  })

  it('`numeric` chega como texto e é convertido', async () => {
    const t = clienteFalso({
      tabelas: {
        workout_logs: [
          { data: { load: '40.00' }, error: null },
          { data: { load: '62.50' }, error: null },
        ],
      },
    })

    const cargas = await t.dataSource.getLoadProgress('org-1', 'stu-1')
    // Sem converter, `'62.50' - '40.00'` dá 22.5 por coincidência do JS — mas
    // o ganho é exibido com `toFixed`, e string sem número quebra ali.
    expect(typeof cargas.ultima).toBe('number')
    expect(typeof cargas.primeira).toBe('number')
  })
})
