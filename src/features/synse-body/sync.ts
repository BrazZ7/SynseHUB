'use client'

import { recordBodyMeasurementAction } from '@/features/synse-body/actions'
import {
  TENTATIVAS_ATE_DESISTIR,
  descartar,
  marcarFalha,
  marcarSincronizada,
  pendentes,
} from '@/features/synse-body/storage/local-measurements'
import type { BodyMeasurement } from '@/types/domain'

/**
 * A fila subindo.
 *
 * Chamada quando o app abre e quando a rede volta. Sequencial de propósito:
 * são poucas pesagens, e mandar todas de uma vez só ganharia milissegundos em
 * troca de um servidor recebendo rajada de uma conexão que acabou de voltar.
 */

export type SyncOutcome = {
  enviadas: number
  falhas: number
  descartadas: number
}

export async function sincronizarPendentes(): Promise<SyncOutcome> {
  const fila = await pendentes()
  const resultado: SyncOutcome = { enviadas: 0, falhas: 0, descartadas: 0 }

  for (const item of fila) {
    const resposta = await recordBodyMeasurementAction(item.measurement)

    if (resposta.status === 'success') {
      await marcarSincronizada(item.clientId)
      resultado.enviadas += 1
      continue
    }

    /*
     * Erro de validação não melhora com repetição. Depois de algumas
     * tentativas a pesagem sai da fila: insistir para sempre gastaria bateria
     * para receber a mesma recusa, e esconderia da pessoa que ela não entrou.
     */
    if (item.attempts + 1 >= TENTATIVAS_ATE_DESISTIR) {
      await descartar(item.clientId)
      resultado.descartadas += 1
      continue
    }

    await marcarFalha(item.clientId, resposta.message)
    resultado.falhas += 1
  }

  return resultado
}

/** Sobe uma pesagem recém-feita, ou deixa na fila se a rede não colaborar. */
export async function enviarAgora(
  measurement: BodyMeasurement,
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const resposta = await recordBodyMeasurementAction(measurement)

  if (resposta.status === 'success') {
    await marcarSincronizada(measurement.clientId)
    return { ok: true, id: resposta.measurementId }
  }

  await marcarFalha(measurement.clientId, resposta.message)
  return { ok: false, message: resposta.message }
}
