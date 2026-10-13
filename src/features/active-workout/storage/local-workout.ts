'use client'

import type { WorkoutSession } from '@/features/active-workout/engine/types'
import {
  chaveDaSessao,
  donoValido,
  filaDoDono,
  sessaoDoDono,
  type RegistroDeSessao,
} from '@/features/active-workout/storage/escopo'

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
 *   sessao  o treino atual, uma linha por dono, para a recuperação
 *   fila    as escritas pendentes, para a sincronização
 *
 * Tudo é escopado pelo dono (`escopo.ts`). Antes não era, e o mesmo aparelho
 * devolvia o treino de uma pessoa para a próxima que entrasse.
 */

const BANCO = 'synse-workout'
/**
 * 1 → 2: o escopo por dono.
 *
 * A virada precisa jogar fora o que a versão 1 gravou, e não há escolha aí: o
 * registro antigo não diz de quem é. Adotá-lo para quem abrisse o app primeiro
 * repetiria, uma última vez, exatamente o vazamento que o escopo corrige — num
 * aparelho compartilhado, as séries de uma pessoa no histórico de outra.
 *
 * Descartar perde, no pior caso, um treino que ainda não subiu. Atribuição
 * errada em dado de saúde é pior que registro perdido, e o aplicativo ainda não
 * está nas lojas, então o pior caso é hipotético. Está registrado em
 * `docs/evolucao-synse.md`.
 */
const VERSAO = 2
const LOJA_SESSAO = 'sessao'
const LOJA_FILA = 'fila'

/**
 * Uma escrita esperando rede. O `clientId` é o que torna o reenvio inofensivo.
 *
 * O `dono` não é enfeite: é ele que impede a série de uma pessoa de subir pela
 * sessão autenticada de outra. As actions não recebem aluno nenhum — o banco
 * resolve pelo `auth.uid()` —, então fila sem dono é fila que se atribui a quem
 * estiver logado na hora de sincronizar.
 */
export type PendingOperation =
  | {
      kind: 'START'
      clientId: string
      dono: string
      workoutPlanId: string | null
      tentativas: number
    }
  | {
      kind: 'SET'
      clientId: string
      dono: string
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
      dono: string
      sessionClientId: string
      durationSeconds: number
      status: 'COMPLETED' | 'ABANDONED'
      tentativas: number
    }

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const pedido = indexedDB.open(BANCO, VERSAO)
    pedido.onupgradeneeded = (evento) => {
      const banco = pedido.result
      if (!banco.objectStoreNames.contains(LOJA_SESSAO)) banco.createObjectStore(LOJA_SESSAO)
      if (!banco.objectStoreNames.contains(LOJA_FILA)) {
        banco.createObjectStore(LOJA_FILA, { keyPath: 'clientId' })
      }

      /*
       * O descarte do que não tem dono acontece aqui, dentro da transação de
       * atualização: roda uma vez por aparelho, antes de qualquer leitura, e
       * nenhum caminho de leitura precisa saber que ele existiu.
       */
      if (evento.oldVersion >= 1 && evento.oldVersion < 2 && pedido.transaction) {
        pedido.transaction.objectStore(LOJA_SESSAO).clear()
        pedido.transaction.objectStore(LOJA_FILA).clear()
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

export async function salvarSessao(dono: string, sessao: WorkoutSession): Promise<void> {
  if (!disponivel() || !donoValido(dono)) return
  try {
    const registro: RegistroDeSessao = { dono, sessao }
    await transacao(LOJA_SESSAO, 'readwrite', (loja) => loja.put(registro, chaveDaSessao(dono)))
  } catch {
    // Gravação falhou; o treino continua na memória. Não é motivo para parar.
  }
}

export async function lerSessao(dono: string): Promise<WorkoutSession | null> {
  if (!disponivel() || !donoValido(dono)) return null
  try {
    const registro = await transacao<RegistroDeSessao | undefined>(
      LOJA_SESSAO,
      'readonly',
      (loja) => loja.get(chaveDaSessao(dono)),
    )
    // A chave já separa; `sessaoDoDono` é a segunda tranca. Ver `escopo.ts`.
    return sessaoDoDono(registro, dono)
  } catch {
    return null
  }
}

export async function limparSessao(dono: string): Promise<void> {
  if (!disponivel() || !donoValido(dono)) return
  try {
    await transacao(LOJA_SESSAO, 'readwrite', (loja) => loja.delete(chaveDaSessao(dono)))
  } catch {
    /* nada a fazer */
  }
}

export async function enfileirar(operacao: PendingOperation): Promise<void> {
  if (!disponivel() || !donoValido(operacao.dono)) return
  try {
    await transacao(LOJA_FILA, 'readwrite', (loja) => loja.put(operacao))
  } catch {
    /* nada a fazer */
  }
}

export async function lerFila(dono: string): Promise<PendingOperation[]> {
  if (!disponivel() || !donoValido(dono)) return []
  try {
    const guardadas = await transacao<PendingOperation[]>(LOJA_FILA, 'readonly', (loja) =>
      loja.getAll(),
    )
    /*
     * Só o que é desta pessoa. O que é de outro dono fica no aparelho,
     * intocado: ele é registro de treino que ainda não subiu, e apagá-lo na
     * troca de conta seria perder o treino de quem não está aqui para
     * reclamar.
     */
    const todas = filaDoDono(guardadas, dono)
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
