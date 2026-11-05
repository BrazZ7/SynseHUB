import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'

import type { WorkoutSession } from '@/features/active-workout/engine/types'
import {
  enfileirar,
  lerFila,
  lerSessao,
  limparSessao,
  removerDaFila,
  salvarSessao,
  type PendingOperation,
} from '@/features/active-workout/storage/local-workout'

/**
 * O armazenamento do treino no aparelho, de verdade.
 *
 * `escopo.test.ts` prova as regras; este arquivo prova o IndexedDB — a chave
 * que separa, o filtro que lê e, principalmente, a atualização de versão que
 * joga fora o que a versão 1 gravou sem dono. Nada disso é verificável lendo o
 * código: é comportamento de banco, e banco se testa abrindo.
 *
 * Cobre dois dos testes de aceite pedidos:
 *   14. sessão expirada não apaga registros locais não sincronizados
 *   15. troca de conta não expõe registros de outro usuário
 */

const ALUNA = 'matricula-1'
const OUTRO = 'matricula-2'

const BANCO = 'synse-workout'
const LOJA_SESSAO = 'sessao'
const LOJA_FILA = 'fila'

const sessao = (planName: string): WorkoutSession => ({
  clientId: 'local-1',
  serverId: null,
  workoutPlanId: null,
  planName,
  state: 'ACTIVE_SET',
  exercises: [],
  exerciseIndex: 0,
  setNumber: 1,
  currentReps: 10,
  currentWeight: 70,
  completedSets: [],
  startedAt: 0,
  setStartedAt: 0,
  restStartedAt: null,
  restEndsAt: null,
  pausedMs: 0,
  pausedAt: null,
  finishedAt: null,
  settings: {
    autoRest: true,
    sound: true,
    vibration: true,
    autoAdvance: false,
    keepScreenAwake: true,
    defaultRestSeconds: 90,
  },
})

const inicio = (clientId: string, dono: string): PendingOperation => ({
  kind: 'START',
  clientId,
  dono,
  workoutPlanId: null,
  tentativas: 0,
})

/** Um aparelho novo para cada teste: estado de banco que vaza entre testes mente. */
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
})

/** Grava no formato da versão 1 — chave única, sem dono — para testar a virada. */
function gravarComoVersao1(): Promise<void> {
  return new Promise((resolve, reject) => {
    const pedido = indexedDB.open(BANCO, 1)
    pedido.onupgradeneeded = () => {
      const banco = pedido.result
      banco.createObjectStore(LOJA_SESSAO)
      banco.createObjectStore(LOJA_FILA, { keyPath: 'clientId' })
    }
    pedido.onerror = () => reject(pedido.error)
    pedido.onsuccess = () => {
      const banco = pedido.result
      const tx = banco.transaction([LOJA_SESSAO, LOJA_FILA], 'readwrite')
      tx.objectStore(LOJA_SESSAO).put(sessao('Treino de alguém'), 'atual')
      tx.objectStore(LOJA_FILA).put({
        kind: 'START',
        clientId: 'antigo-1',
        workoutPlanId: null,
        tentativas: 0,
      })
      tx.oncomplete = () => {
        // Fechar antes de reabrir na versão 2: conexão aberta bloqueia a virada.
        banco.close()
        resolve()
      }
      tx.onerror = () => reject(tx.error)
    }
  })
}

describe('a sessão gravada', () => {
  it('volta para quem a gravou', async () => {
    await salvarSessao(ALUNA, sessao('Treino A'))
    expect((await lerSessao(ALUNA))?.planName).toBe('Treino A')
  })

  it('não aparece para outra matrícula — aceite 15', async () => {
    /*
     * O defeito que isto fecha: no celular do casal, no tablet da recepção ou
     * simplesmente depois de uma troca de conta, quem abria o app depois
     * recuperava o treino de quem abriu antes, com plano, exercícios e cargas.
     */
    await salvarSessao(ALUNA, sessao('Treino A'))
    expect(await lerSessao(OUTRO)).toBeNull()
  })

  it('as duas convivem no mesmo aparelho', async () => {
    await salvarSessao(ALUNA, sessao('Treino A'))
    await salvarSessao(OUTRO, sessao('Treino B'))

    expect((await lerSessao(ALUNA))?.planName).toBe('Treino A')
    expect((await lerSessao(OUTRO))?.planName).toBe('Treino B')
  })

  it('descartar o próprio treino não mexe no de ninguém', async () => {
    await salvarSessao(ALUNA, sessao('Treino A'))
    await salvarSessao(OUTRO, sessao('Treino B'))

    await limparSessao(OUTRO)

    expect((await lerSessao(ALUNA))?.planName).toBe('Treino A')
    expect(await lerSessao(OUTRO)).toBeNull()
  })

  it('dono vazio não grava e não lê', async () => {
    // Gravar em `''` devolveria a chave compartilhada de antes, em silêncio.
    await salvarSessao('', sessao('Treino A'))
    expect(await lerSessao('')).toBeNull()
  })
})

describe('a fila pendente', () => {
  it('é lida por matrícula', async () => {
    await enfileirar(inicio('a-1', ALUNA))
    await enfileirar(inicio('b-1', OUTRO))

    expect((await lerFila(ALUNA)).map((o) => o.clientId)).toEqual(['a-1'])
    expect((await lerFila(OUTRO)).map((o) => o.clientId)).toEqual(['b-1'])
  })

  it('sobrevive à troca de conta e à sessão expirada — aceite 14', async () => {
    /*
     * Nada no caminho de sair da conta toca neste banco: `signOut`
     * (`src/lib/auth/actions.ts:356`) roda no servidor, apaga cookie e sessão
     * do Supabase, e não tem como alcançar o IndexedDB do navegador. Então o
     * que estava para subir continua aqui, esperando a volta de quem o gravou.
     *
     * O teste fixa isso: ler a fila como outra pessoa — que é o que acontece
     * depois do novo login — não remove nada.
     */
    await enfileirar(inicio('a-1', ALUNA))

    await lerFila(OUTRO)
    await limparSessao(OUTRO)

    expect((await lerFila(ALUNA)).map((o) => o.clientId)).toEqual(['a-1'])
  })

  it('o que sobe sai da fila, e só o que subiu', async () => {
    await enfileirar(inicio('a-1', ALUNA))
    await enfileirar(inicio('b-1', OUTRO))

    await removerDaFila('a-1')

    expect(await lerFila(ALUNA)).toEqual([])
    expect((await lerFila(OUTRO)).map((o) => o.clientId)).toEqual(['b-1'])
  })

  it('operação sem dono não entra', async () => {
    await enfileirar({ ...inicio('a-1', ''), dono: '' })
    expect(await lerFila('')).toEqual([])
  })
})

describe('a virada da versão 1 para a 2', () => {
  it('descarta o treino que não tem dono', async () => {
    /*
     * A decisão está em `docs/evolucao-synse.md`: o registro da versão 1 não
     * diz de quem é, e adotá-lo para quem abrir o app primeiro repetiria o
     * vazamento uma última vez. Descartar perde, no pior caso, um treino não
     * sincronizado; atribuição errada em dado de saúde é pior.
     */
    await gravarComoVersao1()

    expect(await lerSessao(ALUNA)).toBeNull()
    expect(await lerSessao(OUTRO)).toBeNull()
  })

  it('descarta também a fila que não tem dono', async () => {
    /*
     * A metade mais perigosa: a fila sobe pela sessão autenticada de quem está
     * logado agora, e o banco resolve o aluno pelo `auth.uid()`. Fila sem dono
     * é série pronta para entrar no histórico da pessoa errada.
     */
    await gravarComoVersao1()

    expect(await lerFila(ALUNA)).toEqual([])
    expect(await lerFila(OUTRO)).toEqual([])
  })

  it('e não é um banco que apaga tudo sempre', async () => {
    /*
     * Controle do par acima. Sem ele, um `clear()` fora do `oldVersion < 2` —
     * ou um banco que simplesmente não guarda nada — passaria nos dois testes
     * anteriores enquanto apagava o treino de quem está treinando agora.
     */
    await gravarComoVersao1()

    await salvarSessao(ALUNA, sessao('Treino A'))
    await enfileirar(inicio('a-1', ALUNA))

    expect((await lerSessao(ALUNA))?.planName).toBe('Treino A')
    expect((await lerFila(ALUNA)).map((o) => o.clientId)).toEqual(['a-1'])
  })
})
