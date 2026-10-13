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

describe('o ganho de carga, na demonstração', () => {
  /*
   * ── Por que o teste antigo daqui foi reescrito ───────────────────────────
   *
   * Ele afirmava que as duas cargas eram "as pontas do histórico inteiro", e
   * passava. Mas passava **por coincidência da semente**: ela registra todo
   * treino no supino, então as pontas do histórico e as pontas do exercício
   * mais treinado são as mesmas linhas. A asserção descrevia um
   * comportamento que a regra nova não promete mais.
   *
   * É o mesmo acidente que escondeu o defeito original por tanto tempo: a
   * legenda fixa "Supino reto" era verdade na demonstração e mentira em
   * qualquer academia real.
   */
  it('fala de um exercício, e diz qual', async () => {
    const { f, alunoId } = await alunoComTreino()

    const cargas = await f.getLoadProgress(DEMO_ORG_ID, alunoId)

    expect(cargas.exercicio).not.toBeNull()
    expect(cargas.exercicio!.nome.length).toBeGreaterThan(0)
    expect(cargas.dias).toBeGreaterThanOrEqual(2)
  })

  it('o nome é de um exercício que existe, não um rótulo inventado', async () => {
    // A legenda antiga era a string "Supino reto" escrita no código. Esta
    // asserção é o que impede qualquer nome fixo de voltar.
    const { f, alunoId } = await alunoComTreino()
    const exercicios = await f.listExercises(DEMO_ORG_ID)

    const cargas = await f.getLoadProgress(DEMO_ORG_ID, alunoId)

    expect(exercicios.some((e) => e.name === cargas.exercicio!.nome)).toBe(true)
  })

  it('a carga do dia é a máxima do dia', async () => {
    /*
     * A semente grava um registro por semana, então cada dia tem um só — o
     * que torna esta asserção fraca na demonstração e forte onde ela importa:
     * `tests/db/ganho-de-carga.test.ts` monta um dia com aquecimento de 20 kg
     * e série valendo de 60, e exige 60.
     *
     * Aqui dá para exigir o que não depende da semente: a última carga é a
     * maior registrada naquele dia, nunca menor que ela.
     */
    const { f, alunoId } = await alunoComTreino()
    const logs = (
      await f.listWorkoutLogs(DEMO_ORG_ID, alunoId, { since: new Date(0).toISOString() })
    ).filter((l) => l.load != null)

    const cargas = await f.getLoadProgress(DEMO_ORG_ID, alunoId)
    const ultimoDia = logs[logs.length - 1].performedAt.slice(0, 10)
    const maiorDoUltimoDia = Math.max(
      ...logs.filter((l) => l.performedAt.startsWith(ultimoDia)).map((l) => l.load as number),
    )

    expect(cargas.ultima).toBe(maiorDoUltimoDia)
  })

  it('aluno sem carga registrada devolve nulo, não zero', async () => {
    /*
     * Zero é uma carga; nulo é "não há registro". A tela mostra "—" para nulo
     * e "+0,0 kg" para zero, e as duas frases dizem coisas diferentes.
     */
    const cargas = await fonte().getLoadProgress(DEMO_ORG_ID, 'stu_nao_existe')

    expect(cargas.primeira).toBeNull()
    expect(cargas.ultima).toBeNull()
    expect(cargas.exercicio).toBeNull()
    expect(cargas.dias).toBe(0)
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

  it('o ganho vem da função do banco, e de um exercício só', async () => {
    /*
     * A 0055 devolve o exercício mais treinado, com a carga máxima do
     * primeiro e do último dia. Antes isto comparava a primeira carga de
     * qualquer exercício com a última de qualquer exercício — rosca de 20 kg
     * seguida de agachamento de 100 virava "+80 kg de ganho".
     */
    const t = clienteFalso({
      rpcs: {
        ganho_de_carga: {
          data: [
            {
              exercise_id: 'exe-1',
              exercise_name: 'Supino reto',
              primeira: '40.00',
              ultima: '62.50',
              dias: '9',
              primeiro_dia: '2026-01-05T00:00:00Z',
              ultimo_dia: '2026-10-05T00:00:00Z',
            },
          ],
          error: null,
        },
      },
    })

    const cargas = await t.dataSource.getLoadProgress('org-1', 'stu-1')

    expect(cargas).toEqual({
      primeira: 40,
      ultima: 62.5,
      exercicio: { id: 'exe-1', nome: 'Supino reto' },
      dias: 9,
    })
    expect(t.argsDaRpc('ganho_de_carga')).toEqual({ p_student_id: 'stu-1' })
  })

  it('não toca em `workout_logs` quando a função existe', async () => {
    /*
     * A asserção que trava a **origem**. `workout_logs` não recebe escrita de
     * lugar nenhum do produto: o treino entra em `workout_set_logs` pela
     * 0026. Voltar a ler a tabela antiga faz os números sumirem em produção e
     * aparecerem na demonstração — que foi como o defeito durou tanto.
     */
    const t = clienteFalso({ rpcs: { ganho_de_carga: { data: [], error: null } } })

    await t.dataSource.getLoadProgress('org-1', 'stu-1')

    expect(t.todasParaTabela('workout_logs')).toEqual([])
  })

  it('sem dois dias do mesmo exercício, devolve nada em vez de zero', async () => {
    // Zero diria "você não evoluiu" para quem acabou de começar. A tela
    // precisa distinguir ausência de resultado nulo.
    const t = clienteFalso({ rpcs: { ganho_de_carga: { data: [], error: null } } })

    expect(await t.dataSource.getLoadProgress('org-1', 'stu-1')).toEqual({
      primeira: null,
      ultima: null,
      exercicio: null,
      dias: 0,
    })
  })

  it('banco sem a 0055 volta ao caminho antigo, em duas ordens opostas', async () => {
    /*
     * Publicar não é migrar. Enquanto o SQL não é colado, a aplicação lê
     * `workout_logs` como lia: `asc` dá a primeira, `desc` a última, e
     * `limit(1)` faz cada resposta não ter o que cortar. Pedir as duas na
     * mesma ordem devolveria a mesma linha e o ganho seria sempre zero.
     */
    const t = clienteFalso({
      rpcs: {
        ganho_de_carga: {
          data: null,
          error: { code: 'PGRST202', message: 'Could not find the function' },
        },
      },
      tabelas: {
        workout_logs: [
          { data: { load: '40.00' }, error: null },
          { data: { load: '62.50' }, error: null },
        ],
      },
    })

    const cargas = await t.dataSource.getLoadProgress('org-1', 'stu-1')

    expect(cargas.primeira).toBe(40)
    expect(cargas.ultima).toBe(62.5)
    // Sem a função, não há exercício para nomear — e a tela não promete um.
    expect(cargas.exercicio).toBeNull()

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
      rpcs: {
        ganho_de_carga: {
          data: [
            {
              exercise_id: 'exe-1',
              exercise_name: 'Supino reto',
              primeira: '40.00',
              ultima: '62.50',
              dias: '9',
            },
          ],
          error: null,
        },
      },
    })

    const cargas = await t.dataSource.getLoadProgress('org-1', 'stu-1')
    // Sem converter, `'62.50' - '40.00'` dá 22.5 por coincidência do JS — mas
    // o ganho é exibido com `toFixed`, e string sem número quebra ali.
    expect(typeof cargas.ultima).toBe('number')
    expect(typeof cargas.primeira).toBe('number')
    expect(typeof cargas.dias).toBe('number')
  })
})
