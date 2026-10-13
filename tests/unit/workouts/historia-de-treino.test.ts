import { describe, expect, it } from 'vitest'

import { DemoDataSource } from '@/lib/database/demo-data-source'
import { DEMO_ORG_ID } from '@/lib/database/demo-seed'
import { clienteFalso } from '../postgrest-falso'

/**
 * ── O histórico de treino ───────────────────────────────────────────────────
 *
 * Duas correções, uma em cima da outra.
 *
 * A primeira: `listWorkoutLogs` lia a tabela inteira de um aluno, sem teto, em
 * ordem **crescente**. O PostgREST corta sem dar erro, e numa ordem crescente
 * o corte descarta o registro **mais recente** — o oposto do que se perde nas
 * outras leituras deste projeto. O "ganho de carga" congelava, o cartão de
 * contagem dizia menos do que é, e os gráficos paravam antes do presente.
 *
 * A segunda, que era a de baixo: a tabela estava **errada**. `workout_logs`
 * não recebe escrita de lugar nenhum do produto — o treino entra em
 * `workout_set_logs` pela 0026. Consertar o teto de uma leitura que sempre
 * devolve vazio em produção não consertava tela nenhuma.
 *
 * Hoje a contagem conta séries de `workout_set_logs`, o ganho vem da 0055, e
 * `listWorkoutLogs` **não existe mais**: era o único leitor da tabela antiga,
 * e deixá-la no data source é deixar a armadilha montada para a próxima tela.
 * A demonstração continua semeando `workout_logs`, e lê dela por dentro.
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
  it('conta séries com carga, e não a janela de noventa dias', async () => {
    /*
     * ── O que este teste NÃO prova, e onde isso é provado ─────────────────
     *
     * "A contagem conta tudo, não a janela" não é verificável aqui: nenhum
     * aluno da semente tem registro além de noventa dias, então a janela e o
     * histórico inteiro são o **mesmo conjunto**.
     *
     * A asserção que pega isso está no caminho do Supabase, lá embaixo: a
     * consulta de contagem não pode levar filtro de data. É onde o dado de
     * verdade vai ter dez anos de histórico.
     */
    const { total } = await alunoComTreino()
    expect(total).toBeGreaterThan(0)
  })

  it('aluno sem treino conta zero', async () => {
    expect(await fonte().countWorkoutLogs(DEMO_ORG_ID, 'stu_nao_existe')).toBe(0)
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
     * Aqui isto é fraco de propósito: a semente grava um registro por semana,
     * então cada dia tem um só. A asserção forte está em dois lugares onde o
     * caso pode ser montado — `tests/unit/workouts/ganho-de-carga.test.ts`,
     * sobre a regra pura, e `tests/db/ganho-de-carga.test.ts`, com um dia de
     * aquecimento de 20 kg e série valendo de 60 exigindo 60.
     *
     * O que dá para exigir da semente é coerência: a carga do cartão é uma
     * das cargas que o aluno registrou, não um número inventado.
     */
    const { f, alunoId } = await alunoComTreino()
    const cargas = await f.getLoadProgress(DEMO_ORG_ID, alunoId)

    expect(cargas.ultima).toBeGreaterThan(0)
    expect(cargas.primeira).toBeGreaterThan(0)
    expect(cargas.ultima).toBeGreaterThan(cargas.primeira!)
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
    const t = clienteFalso({
      tabelas: { workout_set_logs: [{ data: null, error: null, count: 412 }] },
    })

    const total = await t.dataSource.countWorkoutLogs('org-1', 'stu-1')

    expect(total).toBe(412)
    const passos = t.paraTabela('workout_set_logs')!.passos
    expect(passos.find((p) => p.metodo === 'select')!.args[1]).toEqual({
      count: 'exact',
      head: true,
    })
    expect(passos.some((p) => p.metodo === 'gte' || p.metodo === 'lte')).toBe(false)
    expect(passos.some((p) => p.metodo === 'limit' || p.metodo === 'range')).toBe(false)
  })

  it('a contagem é das séries do aluno, na tabela em que o treino entra', async () => {
    /*
     * Contava `workout_logs`, em que nada escreve: o cartão "Treinos
     * registrados" dizia `0` para todo aluno de academia real. O `!inner` é
     * o que permite filtrar pelo aluno no servidor — a série pertence à
     * sessão, e é a sessão que sabe de quem é.
     */
    const t = clienteFalso({
      tabelas: { workout_set_logs: [{ data: null, error: null, count: 7 }] },
    })

    await t.dataSource.countWorkoutLogs('org-1', 'stu-1')

    expect(t.todasParaTabela('workout_logs')).toEqual([])
    const passos = t.paraTabela('workout_set_logs')!.passos
    expect(passos.find((p) => p.metodo === 'select')!.args[0]).toContain('workout_sessions!inner')
    expect(passos).toEqual(
      expect.arrayContaining([
        { metodo: 'eq', args: ['organization_id', 'org-1'] },
        { metodo: 'eq', args: ['workout_sessions.student_id', 'stu-1'] },
        // Série sem carga não é "carga anotada".
        { metodo: 'not', args: ['weight', 'is', null] },
      ]),
    )
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
