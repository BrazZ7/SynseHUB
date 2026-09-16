'use client'

import type { WorkoutSession } from '@/features/active-workout/engine/types'

/**
 * O treino em andamento, gravado no próprio aparelho.
 *
 * Mesmo desenho do `storage/local-activity.ts` da corrida, e pela mesma razão:
 * o navegador descarta a página quando quer — memória apertada, aba trocada,
 * celular bloqueado por vinte minutos. Treino que vive só na memória do React
 * some no meio do supino.
 *
 * IndexedDB e não localStorage: a gravação acontece a cada série e a cada
 * ajuste de carga, e localStorage é síncrono — travaria a interface no momento
 * em que ela precisa responder a um toque.
 *
 * Duas lojas:
 *   sessao  o treino atual, uma linha só, para a recuperação
 *   fila    as escritas pendentes, para a sincronização
 */

const BANCO = 'synse-workout'
const VERSAO = 1
const LOJA_SESSAO = 'sessao'
const LOJA_FILA = 'fila'
const CHAVE_ATUAL = 'atual'

/** Uma escrita esperando rede. O `clientId` é o que torna o reenvio inofensivo. */
export type PendingOperation =
  | { kind: 'START'; clientId: string; workoutPlanId: string | null; tentativas: number }
  | {
      kind: 'SET'
      clientId: string
      sessionClientId: string
      exerciseId: string
      setNumber: number
      repsPlanned: number | null
      repsCompleted: number
      weight: number | null
      restSeconds: number | null
      startedAt: number
      completedAt: number
      tentativas: number
    }
  | {
      kind: 'FINISH'
      clientId: string
      sessionClientId: string
      durationSeconds: number
      status: 'COMPLETED' | 'ABANDONED'
      tentativas: number
    }

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const pedido = indexedDB.open(BANCO, VERSAO)
    pedido.onupgradeneeded = () => {
      const banco = pedido.result
      if (!banco.objectStoreNames.contains(LOJA_SESSAO)) banco.createObjectStore(LOJA_SESSAO)
      if (!banco.objectStoreNames.contains(LOJA_FILA)) {
        banco.createObjectStore(LOJA_FILA, { keyPath: 'clientId' })
      }
    }
    pedido.onsuccess = () => resolve(pedido.result)
    pedido.onerror = () => reject(pedido.error)
  })
}

async function transacao<T>(
  loja: string,
  modo: IDBTransactionMode,
  operacao: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const banco = await abrir()
  return new Promise<T>((resolve, reject) => {
    const tx = banco.transaction(loja, modo)
    const pedido = operacao(tx.objectStore(loja))
    pedido.onsuccess = () => resolve(pedido.result)
    pedido.onerror = () => reject(pedido.error)
    tx.oncomplete = () => banco.close()
  })
}

/**
 * IndexedDB não existe em todo lugar: modo privado de alguns navegadores, um
 * webview restrito, a renderização no servidor. Falhar aqui derrubaria o treino
 * por causa do armazenamento — o oposto do que ele serve. Quem chama trata o
 * nulo e o treino segue só em memória.
 */
const disponivel = () => typeof indexedDB !== 'undefined'

export async function salvarSessao(sessao: WorkoutSession): Promise<void> {
  if (!disponivel()) return
  try {
    await transacao(LOJA_SESSAO, 'readwrite', (loja) => loja.put(sessao, CHAVE_ATUAL))
  } catch {
    // Gravação falhou; o treino continua na memória. Não é motivo para parar.
  }
}

export async function lerSessao(): Promise<WorkoutSession | null> {
  if (!disponivel()) return null
  try {
    return (await transacao<WorkoutSession | undefined>(LOJA_SESSAO, 'readonly', (loja) =>
      loja.get(CHAVE_ATUAL),
    )) ?? null
  } catch {
    return null
  }
}

export async function limparSessao(): Promise<void> {
  if (!disponivel()) return
  try {
    await transacao(LOJA_SESSAO, 'readwrite', (loja) => loja.delete(CHAVE_ATUAL))
  } catch {
    /* nada a fazer */
  }
}

export async function enfileirar(operacao: PendingOperation): Promise<void> {
  if (!disponivel()) return
  try {
    await transacao(LOJA_FILA, 'readwrite', (loja) => loja.put(operacao))
  } catch {
    /* nada a fazer */
  }
}

export async function lerFila(): Promise<PendingOperation[]> {
  if (!disponivel()) return []
  try {
    const todas = await transacao<PendingOperation[]>(LOJA_FILA, 'readonly', (loja) =>
      loja.getAll(),
    )
    /*
     * A ordem importa: abrir o treino precede registrar série, que precede
     * encerrar. Fora de ordem, a série chegaria a uma sessão que o servidor
     * ainda não conhece.
     */
    const peso = { START: 0, SET: 1, FINISH: 2 }
    return todas.sort((a, b) => peso[a.kind] - peso[b.kind])
  } catch {
    return []
  }
}

export async function removerDaFila(clientId: string): Promise<void> {
  if (!disponivel()) return
  try {
    await transacao(LOJA_FILA, 'readwrite', (loja) => loja.delete(clientId))
  } catch {
    /* nada a fazer */
  }
}

export async function registrarTentativa(operacao: PendingOperation): Promise<void> {
  await enfileirar({ ...operacao, tentativas: operacao.tentativas + 1 })
}
