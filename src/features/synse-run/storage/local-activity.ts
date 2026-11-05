'use client'

import type { SportType, TrackPoint } from '@/features/synse-run/engine/types'

/**
 * A corrida em andamento, gravada no próprio aparelho.
 *
 * Existe por dois motivos que se parecem e são diferentes.
 *
 * **Recuperação** (item 45): o navegador pode descartar a página a qualquer
 * momento — memória apertada, aba trocada, celular bloqueado. Se a corrida
 * vivesse só na memória do React, quarenta minutos sumiriam num piscar. Aqui
 * cada ponto é gravado assim que entra.
 *
 * **Offline** (item 46): o GPS não depende de internet, então correr sem sinal
 * de rede é normal — no meio do mato é o caso comum. A corrida termina, fica
 * guardada, e sobe quando houver rede.
 *
 * IndexedDB, e não localStorage: são milhares de pontos, e localStorage é
 * síncrono — gravar a cada segundo travaria a interface junto.
 */

const BANCO = 'synse-run'
const VERSAO = 1
const LOJA = 'atividades'

export type StoredActivity = {
  /** Gerado no aparelho. É ele que torna o reenvio inofensivo. */
  clientId: string
  sport: SportType
  startedAt: number
  pausedMs: number
  points: TrackPoint[]
  syncStatus: 'pending' | 'syncing' | 'synced' | 'error'
  finishedAt: number | null
  updatedAt: number
}

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const pedido = indexedDB.open(BANCO, VERSAO)

    pedido.onupgradeneeded = () => {
      const banco = pedido.result
      if (!banco.objectStoreNames.contains(LOJA)) {
        banco.createObjectStore(LOJA, { keyPath: 'clientId' })
      }
    }

    pedido.onsuccess = () => resolve(pedido.result)
    pedido.onerror = () => reject(pedido.error)
  })
}

async function transacao<T>(
  modo: IDBTransactionMode,
  operacao: (loja: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const banco = await abrir()

  return new Promise<T>((resolve, reject) => {
    const tx = banco.transaction(LOJA, modo)
    const pedido = operacao(tx.objectStore(LOJA))
    pedido.onsuccess = () => resolve(pedido.result)
    pedido.onerror = () => reject(pedido.error)
    tx.oncomplete = () => banco.close()
  })
}

/**
 * Grava o estado atual da corrida.
 *
 * Chamada a cada ponto aceito. Escrever a rota inteira toda vez parece
 * desperdício e não é: são poucos KB, IndexedDB é assíncrono, e a alternativa
 * — gravar só o delta — traz um jogo de merge que só se paga com muito mais
 * volume do que uma corrida tem.
 */
export async function saveLocalActivity(atividade: StoredActivity): Promise<void> {
  try {
    await transacao('readwrite', (loja) =>
      loja.put({ ...atividade, updatedAt: Date.now() } satisfies StoredActivity),
    )
  } catch {
    // Sem IndexedDB (navegação privada, cota estourada), a corrida continua na
    // memória. Perder a recuperação é ruim; interromper a corrida é pior.
  }
}

/** Corrida interrompida que ainda não terminou — a que o app oferece retomar. */
export async function findUnfinishedActivity(): Promise<StoredActivity | null> {
  try {
    const todas = await transacao<StoredActivity[]>('readonly', (loja) => loja.getAll())
    const abertas = todas
      .filter((item) => item.finishedAt === null)
      .sort((a, b) => b.updatedAt - a.updatedAt)

    return abertas[0] ?? null
  } catch {
    return null
  }
}

/** Corridas terminadas que ainda não subiram. */
export async function findPendingUploads(): Promise<StoredActivity[]> {
  try {
    const todas = await transacao<StoredActivity[]>('readonly', (loja) => loja.getAll())
    return todas.filter((item) => item.finishedAt !== null && item.syncStatus !== 'synced')
  } catch {
    return []
  }
}

export async function markSynced(clientId: string): Promise<void> {
  try {
    const atual = await transacao<StoredActivity | undefined>('readonly', (loja) =>
      loja.get(clientId),
    )
    if (!atual) return
    await saveLocalActivity({ ...atual, syncStatus: 'synced' })
  } catch {
    /* ver saveLocalActivity */
  }
}

export async function discardLocalActivity(clientId: string): Promise<void> {
  try {
    await transacao('readwrite', (loja) => loja.delete(clientId))
  } catch {
    /* ver saveLocalActivity */
  }
}

/** Identificador da corrida, criado antes de existir rede. */
export function newClientId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `run-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
