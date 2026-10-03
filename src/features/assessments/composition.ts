import type { AssessmentProtocol, AssessmentSex } from '@/types/domain'

/**
 * As mesmas contas que o gatilho da 0023 faz no banco.
 *
 * Existem duas vezes de propósito, e não é duplicação por descuido: o banco é
 * quem grava, e não confia em número vindo do cliente; esta cópia é para a tela
 * mostrar o percentual enquanto o avaliador digita as dobras, sem ida e volta
 * ao servidor. `tests/unit/assessments/composition.test.ts` compara as duas com
 * os mesmos valores conhecidos, então elas não podem divergir em silêncio.
 *
 * Fórmulas: Jackson & Pollock para densidade corporal, Siri para converter em
 * percentual de gordura.
 */

export type Dobras = {
  chest?: number | null
  axilla?: number | null
  triceps?: number | null
  subscapular?: number | null
  abdominal?: number | null
  suprailiac?: number | null
  thigh?: number | null
}

const n = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/**
 * Quais dobras entram na soma.
 *
 * O conjunto de pontos faz parte da equação, não é escolha do avaliador: somar
 * as sete numa fórmula de três produz um número com cara de medida e sem
 * significado nenhum.
 */
export function somaDasDobras(
  protocolo: AssessmentProtocol,
  sexo: AssessmentSex | null,
  dobras: Dobras,
): number | null {
  if (protocolo === 'POLLOCK_7') {
    return (
      n(dobras.chest) +
      n(dobras.axilla) +
      n(dobras.triceps) +
      n(dobras.subscapular) +
      n(dobras.abdominal) +
      n(dobras.suprailiac) +
      n(dobras.thigh)
    )
  }

  if (protocolo === 'POLLOCK_3') {
    if (sexo === 'MALE') return n(dobras.chest) + n(dobras.abdominal) + n(dobras.thigh)
    if (sexo === 'FEMALE') return n(dobras.triceps) + n(dobras.suprailiac) + n(dobras.thigh)
  }

  return null
}

/** Os pontos que o formulário deve pedir, dado o protocolo e o sexo. */
export function pontosExigidos(
  protocolo: AssessmentProtocol,
  sexo: AssessmentSex | null,
): Array<keyof Dobras> {
  if (protocolo === 'POLLOCK_7') {
    return ['chest', 'axilla', 'triceps', 'subscapular', 'abdominal', 'suprailiac', 'thigh']
  }
  if (protocolo === 'POLLOCK_3' && sexo === 'MALE') return ['chest', 'abdominal', 'thigh']
  if (protocolo === 'POLLOCK_3' && sexo === 'FEMALE') return ['triceps', 'suprailiac', 'thigh']
  return []
}

export function densidadeCorporal(
  protocolo: AssessmentProtocol,
  sexo: AssessmentSex | null,
  idade: number | null,
  soma: number | null,
): number | null {
  if (protocolo === 'MANUAL' || !sexo || !idade || !soma || soma <= 0) return null

  const s2 = soma * soma
  const d =
    protocolo === 'POLLOCK_3'
      ? sexo === 'MALE'
        ? 1.10938 - 0.0008267 * soma + 0.0000016 * s2 - 0.0002574 * idade
        : 1.0994921 - 0.0009929 * soma + 0.0000023 * s2 - 0.0001392 * idade
      : sexo === 'MALE'
        ? 1.112 - 0.00043499 * soma + 0.00000055 * s2 - 0.00028826 * idade
        : 1.097 - 0.00046971 * soma + 0.00000056 * s2 - 0.00012828 * idade

  return Number(d.toFixed(5))
}

/** Equação de Siri. */
export function percentualDeGordura(densidade: number | null): number | null {
  if (!densidade || densidade <= 0) return null
  /*
   * O piso em zero não é enfeite: a equação é uma reta ajustada, e densidade
   * muito alta devolve percentual negativo — que não é uma pessoa magra, é uma
   * dobra medida errado.
   */
  return Math.max(Number((495 / densidade - 450).toFixed(2)), 0)
}

export function imc(pesoKg: number | null, alturaCm: number | null): number | null {
  if (!pesoKg || !alturaCm || alturaCm <= 0) return null
  return Number((pesoKg / (alturaCm / 100) ** 2).toFixed(2))
}

/**
 * As faixas em que as equações foram validadas: 18 a 61 anos para homens, 18 a
 * 55 para mulheres. Fora delas o número sai mesmo assim — academia avalia gente
 * de 65 anos, e não ter número nenhum é pior —, mas a tela avisa.
 */
export function foraDaFaixaValidada(sexo: AssessmentSex | null, idade: number | null): boolean {
  if (!sexo || !idade) return false
  return idade < 18 || idade > (sexo === 'MALE' ? 61 : 55)
}

export function idadeEm(nascimento: string | null, referencia: string): number | null {
  if (!nascimento) return null
  const nasceu = new Date(`${nascimento}T00:00:00`)
  const dia = new Date(`${referencia}T00:00:00`)
  if (Number.isNaN(nasceu.getTime()) || Number.isNaN(dia.getTime())) return null

  let anos = dia.getFullYear() - nasceu.getFullYear()
  const mes = dia.getMonth() - nasceu.getMonth()
  // Aniversário ainda não chegou neste ano: desconta um.
  if (mes < 0 || (mes === 0 && dia.getDate() < nasceu.getDate())) anos -= 1
  return anos >= 0 ? anos : null
}
