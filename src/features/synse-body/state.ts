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

/** O que a faixa de sincronização diz, ou nada quando não há o que dizer. */
export type ResumoDaFila = { texto: string; tom: 'neutro' | 'alerta' } | null

/**
 * O recado da fila de pesagens.
 *
 * Três regras, e a terceira é a que importa:
 *
 * 1. **Nada pendente, nada na tela.** Uma faixa "tudo sincronizado" seria ruído
 *    permanente para informar o estado normal.
 * 2. **Pendente é informação tranquila.** A medição está guardada no aparelho e
 *    sobe sozinha; dizer "erro" faria a pessoa subir na balança de novo e
 *    gravar a mesma pesagem duas vezes.
 * 3. **Descartada precisa ser dita.** Quando a fila desiste — o servidor recusou
 *    as tentativas todas —, aquela pesagem não entrou e não vai entrar. Sumir
 *    em silêncio é o pior desfecho possível: a pessoa acreditaria num histórico
 *    com um buraco que ela não sabe que existe.
 */
export function resumoDaFila(estado: {
  pendentes: number
  enviando: boolean
  descartadas: number
}): ResumoDaFila {
  if (estado.descartadas > 0) {
    const plural = estado.descartadas > 1
    return {
      tom: 'alerta',
      texto: plural
        ? `${estado.descartadas} medições não puderam ser salvas e foram descartadas. Registre o peso à mão se quiser mantê-las.`
        : 'Uma medição não pôde ser salva e foi descartada. Registre o peso à mão se quiser mantê-la.',
    }
  }

  if (estado.pendentes === 0) return null

  const plural = estado.pendentes > 1
  if (estado.enviando) {
    return {
      tom: 'neutro',
      texto: plural
        ? `Enviando ${estado.pendentes} medições que ficaram no aparelho…`
        : 'Enviando a medição que ficou no aparelho…',
    }
  }

  return {
    tom: 'neutro',
    texto: plural
      ? `${estado.pendentes} medições guardadas no aparelho. Sobem sozinhas quando houver internet.`
      : 'Uma medição guardada no aparelho. Sobe sozinha quando houver internet.',
  }
}
