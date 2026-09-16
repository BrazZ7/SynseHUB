import type { BodyMeasurement } from '@/types/domain'

/**
 * Constantes e tipos do Synse Body.
 *
 * Fora de `actions.ts` porque um arquivo `'use server'` só pode exportar
 * função assíncrona — `tests/unit/use-server-exports.test.ts` guarda a regra.
 */

export type RecordMeasurementResult =
  | { status: 'success'; measurementId: string; measurement: BodyMeasurement }
  | { status: 'error'; message: string }

export type DeviceResult = { status: 'success'; deviceId?: string } | { status: 'error'; message: string }

export type ShareResult = { status: 'success' } | { status: 'error'; message: string }

export const PERIODOS = [
  { valor: '7d', rotulo: '7 dias' },
  { valor: '30d', rotulo: '30 dias' },
  { valor: '3m', rotulo: '3 meses' },
  { valor: '6m', rotulo: '6 meses' },
  { valor: '1a', rotulo: '1 ano' },
  { valor: 'tudo', rotulo: 'Tudo' },
] as const

/** O nome que a tela dá a cada campo, e a unidade. */
export const ROTULOS: Record<string, { nome: string; unidade: string; casas: number }> = {
  weightKg: { nome: 'Peso', unidade: 'kg', casas: 1 },
  bmi: { nome: 'IMC', unidade: '', casas: 1 },
  bodyFatPercent: { nome: 'Gordura corporal', unidade: '%', casas: 1 },
  muscleMassKg: { nome: 'Massa muscular', unidade: 'kg', casas: 1 },
  leanMassKg: { nome: 'Massa magra', unidade: 'kg', casas: 1 },
  bodyWaterPercent: { nome: 'Água corporal', unidade: '%', casas: 1 },
  visceralFat: { nome: 'Gordura visceral', unidade: '', casas: 0 },
  boneMassKg: { nome: 'Massa óssea', unidade: 'kg', casas: 1 },
  bmrKcal: { nome: 'Metabolismo basal', unidade: 'kcal', casas: 0 },
  impedanceOhm: { nome: 'Impedância', unidade: 'Ω', casas: 1 },
}

/**
 * Como a tela explica de onde veio cada número.
 *
 * O texto é curto porque vai embaixo do valor, e é explícito porque a
 * diferença entre "a balança mediu" e "a balança estimou" é a diferença entre
 * um dado e um palpite.
 */
export const EXPLICACAO_DA_ORIGEM: Record<string, string> = {
  MEASURED: 'Medido pela balança',
  ESTIMATED: 'Estimado por bioimpedância',
  CALCULATED: 'Calculado pelo Synse',
  ABSENT: 'Não informado pela balança',
}
