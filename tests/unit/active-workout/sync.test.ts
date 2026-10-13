import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PendingOperation } from '@/features/active-workout/storage/local-workout'
/*
 * A ordenação de verdade, e não uma cópia dela no dublê. A ordem é parte do
 * contrato que este arquivo testa — um dublê com a própria regra provaria que
 * duas implementações concordam, não que a fila sobe na ordem certa.
 */
import { ordenarFila } from '@/features/active-workout/storage/ordem'

/**
 * A fila offline.
 *
 * Academia é subsolo com concreto. O treino precisa continuar quando a rede
 * cai, e subir inteiro quando ela volta — sem duplicar nada e sem inverter a
 * ordem, porque série de uma sessão que o servidor ainda não conhece é série
 * perdida.
 *
 * O armazenamento e as actions são substituídos aqui: o que está sob teste é a
 * orquestração, não o IndexedDB nem o Supabase.
 */

const fila: PendingOperation[] = []
const chamadas: string[] = []

vi.mock('@/features/active-workout/storage/local-workout', () => ({
  /*
   * O filtro por dono é parte do contrato que está sob teste, e não detalhe do
   * IndexedDB: `lerFila` devolve o que é da matrícula que perguntou. Se o
   * dublê devolvesse a fila inteira, o teste do escopo passaria por acidente.
   */
  lerFila: vi.fn(async (dono: string) => ordenarFila(fila.filter((o) => o.dono === dono))),
  removerDaFila: vi.fn(async (clientId: string) => {
    const i = fila.findIndex((o) => o.clientId === clientId)
    if (i >= 0) fila.splice(i, 1)
  }),
  registrarTentativa: vi.fn(async (operacao: PendingOperation) => {
    const i = fila.findIndex((o) => o.clientId === operacao.clientId)
    if (i >= 0) fila[i] = { ...operacao, tentativas: operacao.tentativas + 1 }
  }),
  enfileirar: vi.fn(),
}))

const semRede = { ok: false as const, erro: 'Falha de rede' }
let redeDisponivel = true

vi.mock('@/features/active-workout/actions', () => ({
  startWorkoutSessionAction: vi.fn(async (clientId: string) => {
    chamadas.push(`START:${clientId}`)
    return redeDisponivel ? { ok: true as const, id: 'servidor-1' } : semRede
  }),
  logWorkoutSetAction: vi.fn(async (input: { clientId: string; sessionId: string }) => {
    chamadas.push(`SET:${input.clientId}@${input.sessionId}`)
    return redeDisponivel ? { ok: true as const, id: 'set-x' } : semRede
  }),
  undoWorkoutSetAction: vi.fn(async (sessionId: string, serieClientId: string) => {
    chamadas.push(`UNDO:${serieClientId}@${sessionId}`)
    return redeDisponivel ? { ok: true as const } : semRede
  }),
  finishWorkoutSessionAction: vi.fn(async () => {
    chamadas.push('FINISH')
    return redeDisponivel ? { ok: true as const } : semRede
  }),
}))

const { sincronizar } = await import('@/features/active-workout/sync')

const ALUNA = 'matricula-1'
const OUTRO = 'matricula-2'

/** O ramo `SET` da união, para os testes poderem sobrescrever campos dele. */
type OperacaoDeSerie = Extract<PendingOperation, { kind: 'SET' }>

const serie = (n: number, dono = ALUNA): OperacaoDeSerie => ({
  kind: 'SET',
  clientId: `s-${n}`,
  dono,
  sessionClientId: 'local-1',
  exerciseId: 'ex-1',
  setNumber: n,
  repsPlanned: 10,
  repsCompleted: 10,
  weight: 70,
  restSeconds: 90,
  startedAt: 1_000,
  completedAt: 2_000,
  tentativas: 0,
})

beforeEach(() => {
  fila.length = 0
  chamadas.length = 0
  redeDisponivel = true
})

describe('ordem', () => {
  it('abre a sessão antes de mandar série, mesmo enfileirada fora de ordem', async () => {
    /*
     * A série precisa do id do servidor, que só existe depois do START. Fora de
     * ordem, ela chegaria a uma sessão inexistente.
     */
    fila.push(serie(2), serie(1), {
      kind: 'START',
      clientId: 'local-1',
      dono: ALUNA,
      workoutPlanId: 'plano-1',
      tentativas: 0,
    })

    const resultado = await sincronizar(ALUNA, null)

    expect(chamadas[0]).toBe('START:local-1')
    expect(resultado.enviadas).toBe(3)
    expect(resultado.pendentes).toBe(0)
    expect(resultado.sessionId).toBe('servidor-1')
  })

  it('as séries sobem com o id que o servidor devolveu, não com o local', async () => {
    fila.push(
      { kind: 'START', clientId: 'local-1', dono: ALUNA, workoutPlanId: null, tentativas: 0 },
      serie(1),
    )
    await sincronizar(ALUNA, null)
    expect(chamadas).toContain('SET:s-1@servidor-1')
  })
})

describe('a rede cai no meio', () => {
  it('nada é perdido: a fila segura o que não subiu', async () => {
    fila.push(
      { kind: 'START', clientId: 'local-1', dono: ALUNA, workoutPlanId: null, tentativas: 0 },
      serie(1),
      serie(2),
    )
    redeDisponivel = false

    const resultado = await sincronizar(ALUNA, null)

    expect(resultado.enviadas).toBe(0)
    expect(resultado.pendentes).toBe(3)
  })

  it('e sobe tudo quando ela volta', async () => {
    fila.push(
      { kind: 'START', clientId: 'local-1', dono: ALUNA, workoutPlanId: null, tentativas: 0 },
      serie(1),
      serie(2),
    )
    redeDisponivel = false
    await sincronizar(ALUNA, null)

    redeDisponivel = true
    const resultado = await sincronizar(ALUNA, null)

    expect(resultado.enviadas).toBe(3)
    expect(resultado.pendentes).toBe(0)
  })

  it('para na primeira falha em vez de gastar rede com o resto', async () => {
    // As seguintes dependem da sessão que acabou de falhar; insistir nelas só
    // encheria o log de erro.
    fila.push(
      { kind: 'START', clientId: 'local-1', dono: ALUNA, workoutPlanId: null, tentativas: 0 },
      serie(1),
    )
    redeDisponivel = false
    await sincronizar(ALUNA, null)

    expect(chamadas).toEqual(['START:local-1'])
  })

  it('não manda série antes de a sessão existir no servidor', async () => {
    fila.push(serie(1))
    const resultado = await sincronizar(ALUNA, null)

    expect(chamadas).toHaveLength(0)
    expect(resultado.pendentes).toBe(1)
  })
})

describe('tentativas', () => {
  it('conta a falha, para não tentar para sempre', async () => {
    fila.push({ kind: 'START', clientId: 'local-1', dono: ALUNA, workoutPlanId: null, tentativas: 0 })
    redeDisponivel = false
    await sincronizar(ALUNA, null)

    expect(fila[0].tentativas).toBe(1)
  })

  it('depois do limite a operação sai da fila, e a perda é contada', async () => {
    /*
     * Oito falhas é erro que não é de rede — payload recusado pelo banco, por
     * exemplo. Insistir para sempre gastaria bateria a cada abertura do app.
     *
     * Antes, ela era apenas pulada e **ficava na fila**: o contador de
     * pendentes nunca chegava a zero, e a tela dizia "1 a sincronizar"
     * indefinidamente, sem explicar e sem resolver. Agora sai, e sai contada —
     * porque um treino que não subiu precisa ser dito, não escondido.
     */
    fila.push({ kind: 'START', clientId: 'local-1', dono: ALUNA, workoutPlanId: null, tentativas: 8 })
    const resultado = await sincronizar(ALUNA, null)

    expect(chamadas).toHaveLength(0)
    expect(resultado.pendentes).toBe(0)
    expect(resultado.treinosPerdidos).toBe(1)
  })

  it('a série órfã não fica pendente para sempre', async () => {
    /*
     * O caso mais sorrateiro: a série depende do id que o servidor daria ao
     * abrir a sessão. Com a abertura esgotada, esse id nunca existirá — e o
     * laço de sincronização pula a série por falta dele, então ela nunca soma
     * tentativa e nunca se esgota sozinha. Pendente eterno.
     */
    fila.push({ kind: 'START', clientId: 'local-1', dono: ALUNA, workoutPlanId: null, tentativas: 8 })
    fila.push(serie(1))

    const resultado = await sincronizar(ALUNA, null)

    expect(resultado.pendentes).toBe(0)
    expect(resultado.treinosPerdidos).toBe(1)
    expect(resultado.seriesPerdidas).toBe(1)
    expect(fila).toHaveLength(0)
  })
})

describe('reenvio', () => {
  it('sincronizar de novo com a fila vazia não chama nada', async () => {
    const resultado = await sincronizar(ALUNA, 'servidor-1')
    expect(chamadas).toHaveLength(0)
    expect(resultado.enviadas).toBe(0)
  })

  it('o encerramento sobe depois das séries', async () => {
    fila.push(
      { kind: 'FINISH', clientId: 'f-1', dono: ALUNA, sessionClientId: 'local-1', durationSeconds: 1800, status: 'COMPLETED', tentativas: 0 },
      serie(1),
      { kind: 'START', clientId: 'local-1', dono: ALUNA, workoutPlanId: null, tentativas: 0 },
    )
    await sincronizar(ALUNA, null)

    expect(chamadas).toEqual(['START:local-1', 'SET:s-1@servidor-1', 'FINISH'])
  })
})

describe('desfazer na fila', () => {
  const desfazer = (clientId: string, serieClientId: string): PendingOperation => ({
    kind: 'UNDO',
    clientId,
    dono: ALUNA,
    sessionClientId: 'local-1',
    serieClientId,
    tentativas: 0,
  })

  it('sobe logo atrás da série que desfaz', async () => {
    /*
     * A série errada, o desfazer e a correção com o mesmo número de série.
     * `unique (session_id, exercise_id, set_number)` (0026) recusa a correção
     * se ela chegar antes do desfazer — e a fila então insistiria oito vezes
     * numa série que a pessoa fez.
     */
    fila.push(
      { kind: 'START', clientId: 'local-1', dono: ALUNA, workoutPlanId: null, tentativas: 0 },
      { ...serie(3), clientId: 's-3b', completedAt: 3_000 },
      desfazer('u-1', 's-3'),
      { ...serie(3), clientId: 's-3', completedAt: 2_000 },
    )

    await sincronizar(ALUNA, null)

    expect(chamadas).toEqual([
      'START:local-1',
      'SET:s-3@servidor-1',
      'UNDO:s-3@servidor-1',
      'SET:s-3b@servidor-1',
    ])
  })

  it('o desfazer da série que já subiu também sobe', async () => {
    fila.push(
      { kind: 'START', clientId: 'local-1', dono: ALUNA, workoutPlanId: null, tentativas: 0 },
      desfazer('u-1', 's-que-ja-subiu'),
    )

    const resultado = await sincronizar(ALUNA, null)

    expect(chamadas).toContain('UNDO:s-que-ja-subiu@servidor-1')
    expect(resultado.pendentes).toBe(0)
  })

  it('sem rede, espera como todo o resto', async () => {
    fila.push(desfazer('u-1', 's-1'))
    redeDisponivel = false

    const resultado = await sincronizar(ALUNA, 'servidor-1')

    expect(resultado.pendentes).toBe(1)
    expect(resultado.desfazerPerdidos).toBe(0)
  })

  it('o desfazer esgotado não é contado como série perdida', async () => {
    /*
     * A notícia é a oposta: a série que a pessoa quis tirar continua no
     * servidor. Chamar isso de "série não pôde ser enviada" mandaria procurar
     * um treino que está lá, e esconderia o que de fato aconteceu.
     */
    fila.push({ ...desfazer('u-1', 's-1'), tentativas: 8 })

    const resultado = await sincronizar(ALUNA, 'servidor-1')

    expect(resultado.seriesPerdidas).toBe(0)
    expect(resultado.desfazerPerdidos).toBe(1)
    expect(resultado.pendentes).toBe(0)
  })

  it('a série esgotada continua sendo série perdida', async () => {
    // Controle do teste acima: a separação não pode ter apagado a contagem
    // que já existia.
    fila.push({ ...serie(1), tentativas: 8 })

    const resultado = await sincronizar(ALUNA, 'servidor-1')

    expect(resultado.seriesPerdidas).toBe(1)
    expect(resultado.desfazerPerdidos).toBe(0)
  })
})

describe('escopo por aluno', () => {
  /*
   * O defeito que estes testes fecham: a fila era uma lista só, sem dono. As
   * actions não recebem aluno — o banco resolve pelo `auth.uid()` —, então a
   * série gravada no aparelho por quem entrou antes subia pela sessão
   * autenticada de quem entrou depois, e entrava no histórico da pessoa errada.
   * Em dado de saúde, atribuição errada é pior que registro perdido.
   */
  it('a fila de outra matrícula não sobe nesta sessão', async () => {
    fila.push(
      { kind: 'START', clientId: 'local-9', dono: OUTRO, workoutPlanId: null, tentativas: 0 },
      serie(9, OUTRO),
    )

    const resultado = await sincronizar(ALUNA, null)

    expect(chamadas).toHaveLength(0)
    expect(resultado.enviadas).toBe(0)
    // E continua no aparelho: não é dado para jogar fora, é dado de outra pessoa.
    expect(fila).toHaveLength(2)
  })

  it('e sobe quando é a dona dela que sincroniza', async () => {
    // Controle do teste acima: sem isto, um `lerFila` que devolvesse sempre
    // vazio passaria nos dois.
    fila.push(
      { kind: 'START', clientId: 'local-9', dono: OUTRO, workoutPlanId: null, tentativas: 0 },
      serie(9, OUTRO),
    )

    const resultado = await sincronizar(OUTRO, null)

    expect(resultado.enviadas).toBe(2)
    expect(fila).toHaveLength(0)
  })

  it('o pendente contado é o da pessoa, não o do aparelho', async () => {
    /*
     * "2 a sincronizar" para quem tem um registro só manda a pessoa procurar
     * um treino que não é dela — e não há tela onde ela possa achá-lo.
     */
    fila.push(
      { kind: 'START', clientId: 'local-9', dono: OUTRO, workoutPlanId: null, tentativas: 0 },
      { kind: 'START', clientId: 'local-1', dono: ALUNA, workoutPlanId: null, tentativas: 0 },
    )
    redeDisponivel = false

    const resultado = await sincronizar(ALUNA, null)

    expect(resultado.pendentes).toBe(1)
  })

  it('o expurgo não alcança a fila de outra matrícula', async () => {
    /*
     * O expurgo apaga por `clientId`, que é único no mundo — mas ele só pode
     * apagar o que viu, e ele vê a fila filtrada. Uma operação esgotada de
     * outra pessoa não é perda desta sessão para contar nem para remover.
     */
    fila.push(
      { kind: 'START', clientId: 'local-9', dono: OUTRO, workoutPlanId: null, tentativas: 8 },
      { kind: 'START', clientId: 'local-1', dono: ALUNA, workoutPlanId: null, tentativas: 0 },
    )

    const resultado = await sincronizar(ALUNA, null)

    expect(resultado.treinosPerdidos).toBe(0)
    expect(resultado.enviadas).toBe(1)
    expect(fila.map((o) => o.clientId)).toEqual(['local-9'])
  })
})
