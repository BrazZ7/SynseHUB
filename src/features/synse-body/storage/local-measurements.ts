'use client'

import type { BodyMeasurement } from '@/types/domain'

/**
 * A fila de pesagens que ainda não subiram.
 *
 * A balança é Bluetooth, não é internet: pesar no banheiro de manhã, com o
 * celular no modo avião ou sem sinal, é o caso comum e não a exceção. A
 * medição acontece de qualquer jeito; o que falta é a viagem até o servidor.
 *
 * Gravada assim que a leitura estabiliza, antes de qualquer tentativa de rede.
 * O `clientId` gerado no aparelho é o que torna o reenvio inofensivo: o banco
 * tem `unique (user_profile_id, client_id)` e devolve o mesmo id de volta.
 *
 * IndexedDB e não localStorage porque o pacote bruto entra junto, e
 * localStorage é síncrono — gravar ali travaria a tela no meio da animação da
 * pesagem.
 */

const BANCO = 'synse-body'
const VERSAO = 1
const LOJA = 'pesagens'

export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'error'

export type StoredMeasurement = {
  clientId: string
  measurement: BodyMeasurement
  syncStatus: SyncStatus
  /** Quantas vezes já tentou subir. Serve para espaçar as tentativas. */
  attempts: number
  lastError: string | null
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

/** Guarda a pesagem no aparelho. Chamada antes de tentar a rede. */
export async function enfileirar(measurement: BodyMeasurement): Promise<void> {
  try {
    await transacao('readwrite', (loja) =>
      loja.put({
        clientId: measurement.clientId,
        measurement,
        syncStatus: 'pending',
        attempts: 0,
        lastError: null,
        updatedAt: Date.now(),
      } satisfies StoredMeasurement),
    )
  } catch {
    /*
     * Sem IndexedDB (navegação privada, cota estourada) a pesagem segue só na
     * memória e tenta subir agora. Perder a fila é ruim; impedir a pessoa de
     * se pesar é pior.
     */
  }
}

export async function pendentes(): Promise<StoredMeasurement[]> {
  try {
    const todas = await transacao<StoredMeasurement[]>('readonly', (loja) => loja.getAll())
    return todas
      .filter((item) => item.syncStatus !== 'synced')
      .sort((a, b) => a.updatedAt - b.updatedAt)
  } catch {
    return []
  }
}

export async function marcarSincronizada(clientId: string): Promise<void> {
  try {
    /*
     * Apaga em vez de marcar. O histórico canônico é o do servidor, e manter
     * uma cópia local sincronizada criaria duas verdades para a mesma pesagem
     * — com a local sem o id que o banco atribuiu.
     */
    await transacao('readwrite', (loja) => loja.delete(clientId))
  } catch {
    /* ver enfileirar */
  }
}

export async function marcarFalha(clientId: string, erro: string): Promise<void> {
  try {
    const atual = await transacao<StoredMeasurement | undefined>('readonly', (loja) =>
      loja.get(clientId),
    )
    if (!atual) return

    await transacao('readwrite', (loja) =>
      loja.put({
        ...atual,
        syncStatus: 'error',
        attempts: atual.attempts + 1,
        lastError: erro.slice(0, 300),
        updatedAt: Date.now(),
      } satisfies StoredMeasurement),
    )
  } catch {
    /* ver enfileirar */
  }
}

/**
 * Desiste de uma pesagem que o servidor recusa.
 *
 * Existe para a fila não tentar para sempre. Um erro de validação não melhora
 * com repetição: reenviar a cada abertura do app gastaria bateria para receber
 * a mesma recusa, e esconderia da pessoa que aquela medição não entrou.
 */
export async function descartar(clientId: string): Promise<void> {
  try {
    await transacao('readwrite', (loja) => loja.delete(clientId))
  } catch {
    /* ver enfileirar */
  }
}

/** Quantas tentativas antes de considerar a recusa definitiva. */
export const TENTATIVAS_ATE_DESISTIR = 5
