'use server'

import { revalidatePath } from 'next/cache'

import type { DeviceResult, RecordMeasurementResult, ShareResult } from '@/features/synse-body/state'
import { requireSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { logger } from '@/lib/logger'
import {
  manualBodyMeasurementSchema,
  pairDeviceSchema,
  recordBodyMeasurementSchema,
} from '@/lib/validations/body'
import type { BodyMeasurement } from '@/types/domain'

/**
 * As escritas do Synse Body.
 *
 * Nenhuma delas recebe de quem é a medição. A pessoa sai do `auth.uid()`
 * dentro de `record_body_measurement`, no banco — aceitar um `userProfileId`
 * do formulário deixaria qualquer conta gravar peso em nome de outra, e numa
 * balança de família esse é o erro mais fácil de cometer.
 *
 * Por isso também não há `requirePermission` aqui: não existe permissão de
 * academia que autorize mexer no corpo de alguém. O que existe é a sessão, e a
 * RLS por cima.
 */

const ERRO_GENERICO = 'Não foi possível salvar a medição. Tente de novo.'

/** Grava a pesagem que veio da balança. */
export async function recordBodyMeasurementAction(payload: unknown): Promise<RecordMeasurementResult> {
  await requireSession()

  const parsed = recordBodyMeasurementSchema.safeParse(payload)
  if (!parsed.success) {
    logger.warn('synse-body:payload_invalido', {
      erro: parsed.error.issues[0]?.message,
      campo: parsed.error.issues[0]?.path.join('.'),
    })
    return { status: 'error', message: 'Não foi possível ler os dados desta medição.' }
  }

  const medida = parsed.data as BodyMeasurement

  try {
    const dataSource = await getDataSource()
    const id = await dataSource.recordBodyMeasurement(medida)

    revalidatePath('/app/corpo')
    return { status: 'success', measurementId: id, measurement: { ...medida, id } }
  } catch (erro) {
    /*
     * A função do banco recusa aparelho que não é da pessoa com 42501. Vale a
     * mensagem específica: "este aparelho não é seu" é acionável — numa
     * balança de família, quer dizer que a pessoa errada está logada no app.
     */
    const texto = erro instanceof Error ? String(erro.cause ?? erro.message) : String(erro)
    if (/não é seu|42501/.test(texto)) {
      return { status: 'error', message: 'Este aparelho está vinculado a outra pessoa.' }
    }

    logger.error('synse-body:record_falhou', { erro: texto })
    return { status: 'error', message: ERRO_GENERICO }
  }
}

/** Grava a pesagem digitada à mão. */
export async function recordManualMeasurementAction(payload: unknown): Promise<RecordMeasurementResult> {
  await requireSession()

  const parsed = manualBodyMeasurementSchema.safeParse(payload)
  if (!parsed.success) {
    return { status: 'error', message: 'Informe um peso válido.' }
  }

  const { clientId, weightKg, bodyFatPercent, measuredAt } = parsed.data
  const medida: BodyMeasurement = {
    clientId,
    measuredAt: measuredAt ?? new Date().toISOString(),
    source: 'MANUAL',
    deviceId: null,
    weightKg,
    bodyFatPercent: bodyFatPercent ?? null,
    fieldOrigin: {
      weightKg: 'MEASURED',
      ...(bodyFatPercent == null ? {} : { bodyFatPercent: 'ESTIMATED' as const }),
    },
  }

  try {
    const dataSource = await getDataSource()
    const id = await dataSource.recordBodyMeasurement(medida)

    revalidatePath('/app/corpo')
    return { status: 'success', measurementId: id, measurement: { ...medida, id } }
  } catch (erro) {
    logger.error('synse-body:manual_falhou', { erro: String(erro) })
    return { status: 'error', message: ERRO_GENERICO }
  }
}

/**
 * Apaga uma medição.
 *
 * Existe porque dado corporal que não se apaga é dado que prende. A RLS só
 * deixa apagar o que é da própria pessoa.
 */
export async function deleteBodyMeasurementAction(measurementId: string): Promise<ShareResult> {
  await requireSession()

  try {
    const dataSource = await getDataSource()
    await dataSource.deleteBodyMeasurement(measurementId)
    revalidatePath('/app/corpo')
    return { status: 'success' }
  } catch (erro) {
    logger.error('synse-body:delete_falhou', { erro: String(erro) })
    return { status: 'error', message: 'Não foi possível apagar esta medição.' }
  }
}

/** Vincula a balança à pessoa autenticada. */
export async function pairDeviceAction(payload: unknown): Promise<DeviceResult> {
  await requireSession()

  const parsed = pairDeviceSchema.safeParse(payload)
  if (!parsed.success) {
    return { status: 'error', message: 'Não foi possível identificar este aparelho.' }
  }

  try {
    const dataSource = await getDataSource()
    const id = await dataSource.pairUserDevice(parsed.data)
    revalidatePath('/app/corpo/aparelhos')
    return { status: 'success', deviceId: id }
  } catch (erro) {
    logger.error('synse-body:pair_falhou', { erro: String(erro) })
    return { status: 'error', message: 'Não foi possível vincular este aparelho.' }
  }
}

export async function renameDeviceAction(deviceId: string, displayName: string): Promise<DeviceResult> {
  await requireSession()

  const nome = displayName.trim()
  if (!nome || nome.length > 80) {
    return { status: 'error', message: 'Dê um nome de até 80 caracteres ao aparelho.' }
  }

  try {
    const dataSource = await getDataSource()
    await dataSource.renameUserDevice(deviceId, nome)
    revalidatePath('/app/corpo/aparelhos')
    return { status: 'success' }
  } catch (erro) {
    logger.error('synse-body:rename_falhou', { erro: String(erro) })
    return { status: 'error', message: 'Não foi possível renomear este aparelho.' }
  }
}

/** Desvincula sem apagar o histórico: as pesagens já feitas continuam sendo dela. */
export async function unpairDeviceAction(deviceId: string): Promise<DeviceResult> {
  await requireSession()

  try {
    const dataSource = await getDataSource()
    await dataSource.unpairUserDevice(deviceId)
    revalidatePath('/app/corpo/aparelhos')
    return { status: 'success' }
  } catch (erro) {
    logger.error('synse-body:unpair_falhou', { erro: String(erro) })
    return { status: 'error', message: 'Não foi possível desvincular este aparelho.' }
  }
}

/**
 * Autoriza alguém a ver o próprio histórico.
 *
 * Nominal e revogável, nunca por academia: bioimpedância diz gordura visceral
 * e água corporal de uma pessoa, e "trabalha na mesma academia" não é
 * consentimento.
 */
export async function grantBodyShareAction(
  sharedWithProfileId: string,
  organizationId: string | null,
): Promise<ShareResult> {
  await requireSession()

  try {
    const dataSource = await getDataSource()
    await dataSource.grantBodyShare(sharedWithProfileId, organizationId)
    revalidatePath('/app/corpo/compartilhamento')
    return { status: 'success' }
  } catch (erro) {
    logger.error('synse-body:share_falhou', { erro: String(erro) })
    return { status: 'error', message: 'Não foi possível autorizar.' }
  }
}

export async function revokeBodyShareAction(shareId: string): Promise<ShareResult> {
  await requireSession()

  try {
    const dataSource = await getDataSource()
    await dataSource.revokeBodyShare(shareId)
    revalidatePath('/app/corpo/compartilhamento')
    return { status: 'success' }
  } catch (erro) {
    logger.error('synse-body:revoke_falhou', { erro: String(erro) })
    return { status: 'error', message: 'Não foi possível revogar.' }
  }
}
