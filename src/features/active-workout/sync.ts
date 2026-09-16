'use client'

import {
  finishWorkoutSessionAction,
  logWorkoutSetAction,
  startWorkoutSessionAction,
} from '@/features/active-workout/actions'
import {
  lerFila,
  registrarTentativa,
  removerDaFila,
  type PendingOperation,
} from '@/features/active-workout/storage/local-workout'

/**
 * A fila sobe quando dá.
 *
 * O treino nunca espera rede: a série entra no estado local e na fila, e a tela
 * responde na hora. Academia é subsolo com concreto no meio, e travar o botão
 * de concluir série até o Supabase responder seria perder o treino por causa do
 * sinal.
 *
 * O reenvio é seguro porque cada operação carrega um `clientId` e o banco tem
 * `unique (session_id, client_id)`. Mandar duas vezes é caro em rede e
 * inofensivo em dado.
 */

/** Depois disto a operação para de tentar sozinha e espera a próxima abertura. */
const MAX_TENTATIVAS = 8

export type SyncOutcome = { enviadas: number; pendentes: number; sessionId: string | null }

/**
 * Processa a fila em ordem. Devolve o id da sessão no servidor quando ele
 * aparece — é ele que as operações seguintes precisam.
 */
export async function sincronizar(sessionIdConhecido: string | null): Promise<SyncOutcome> {
  const fila = await lerFila()
  let sessionId = sessionIdConhecido
  let enviadas = 0

  for (const operacao of fila) {
    if (operacao.tentativas >= MAX_TENTATIVAS) continue

    /*
     * Série e encerramento precisam do id do servidor. Sem ele, a abertura
     * ainda não subiu — e insistir aqui só gastaria rede. A fila é ordenada,
     * então isto só acontece quando o START falhou nesta mesma passagem.
     */
    if (operacao.kind !== 'START' && !sessionId) break

    const resultado = await executar(operacao, sessionId)

    if (resultado.ok) {
      if (operacao.kind === 'START' && resultado.id) sessionId = resultado.id
      await removerDaFila(operacao.clientId)
      enviadas += 1
    } else {
      /*
       * Falhou: conta a tentativa e para a passagem. Continuar com as demais
       * mandaria série de uma sessão que não existe no servidor, e encheria o
       * log de erro para nada.
       */
      await registrarTentativa(operacao)
      break
    }
  }

  const restante = await lerFila()
  return { enviadas, pendentes: restante.length, sessionId }
}

async function executar(operacao: PendingOperation, sessionId: string | null) {
  switch (operacao.kind) {
    case 'START':
      return startWorkoutSessionAction(operacao.clientId, operacao.workoutPlanId)

    case 'SET':
      return logWorkoutSetAction({
        sessionId: sessionId!,
        exerciseId: operacao.exerciseId,
        setNumber: operacao.setNumber,
        repsCompleted: operacao.repsCompleted,
        clientId: operacao.clientId,
        weight: operacao.weight,
        repsPlanned: operacao.repsPlanned,
        restSeconds: operacao.restSeconds,
        startedAt: new Date(operacao.startedAt).toISOString(),
        completedAt: new Date(operacao.completedAt).toISOString(),
      })

    case 'FINISH':
      return finishWorkoutSessionAction(sessionId!, operacao.durationSeconds, operacao.status)
  }
}
