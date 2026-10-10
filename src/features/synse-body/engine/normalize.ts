import type {
  BodyMeasurement,
  FieldOriginMap,
  NormalizationContext,
  NormalizedResult,
  ParsedScaleReading,
} from './types'

/**
 * Do pacote para a medição.
 *
 * Aqui mora a regra que a tela depende para ser honesta: separar o que o
 * sensor leu do que a bioimpedância estimou e do que o Synse calculou.
 *
 * A balança mede duas coisas — o peso, numa célula de carga, e a impedância,
 * passando uma corrente fraquíssima entre os pés. Todo o resto (gordura,
 * água, massa muscular, metabolismo) sai de uma fórmula proprietária aplicada
 * sobre a impedância, e nenhum fabricante publica a dele. É estimativa.
 * Chamar de medição seria mentir sobre a precisão de um número que a pessoa
 * vai usar para decidir sobre o próprio corpo.
 */

/** O que cabe numa balança de pessoa. Fora disto é gato, mochila ou defeito. */
const PESO_MINIMO_KG = 2
const PESO_MAXIMO_KG = 400
/** Fora desta faixa o número é possível, mas merece um aviso na tela. */
const PESO_ESPERADO_MIN_KG = 25
const PESO_ESPERADO_MAX_KG = 300

const ALTURA_MINIMA_M = 0.5
const ALTURA_MAXIMA_M = 2.6

const arredondar = (valor: number, casas: number) => {
  const fator = 10 ** casas
  return Math.round(valor * fator) / fator
}

/**
 * Normaliza a leitura de uma balança.
 *
 * Recusa em vez de adivinhar. Um pacote parcial, uma medição que a balança
 * declarou malsucedida ou um peso impossível viram recusa explícita — gravar
 * "mais ou menos" polui um histórico que a pessoa vai olhar por anos.
 */
export function normalizeScaleReading(
  leitura: ParsedScaleReading,
  contexto: NormalizationContext,
): NormalizedResult {
  const avisos: string[] = []

  if (leitura.continues) {
    return {
      ok: false,
      reason: 'PACOTE_INCOMPLETO',
      message: 'A balança ainda está enviando esta medição.',
    }
  }

  const peso = leitura.weightKg
  if (peso === undefined || peso === null) {
    return leitura.unsuccessful
      ? { ok: false, reason: 'MEDICAO_MALSUCEDIDA', message: 'A balança não concluiu a medição.' }
      : { ok: false, reason: 'SEM_PESO', message: 'A medição chegou sem peso.' }
  }

  if (!Number.isFinite(peso) || peso < PESO_MINIMO_KG || peso > PESO_MAXIMO_KG) {
    return {
      ok: false,
      reason: 'PESO_IMPLAUSIVEL',
      message: `Peso fora do que uma balança de pessoa mede: ${arredondar(peso, 2)} kg.`,
    }
  }

  if (peso < PESO_ESPERADO_MIN_KG || peso > PESO_ESPERADO_MAX_KG) {
    avisos.push('Peso incomum. Confira se foi mesmo uma pessoa que subiu na balança.')
  }

  if (leitura.reportedImperial) {
    // Fica no registro: se um dia um peso vier estranho, o log diz se houve conversão.
    avisos.push('A balança reportou em libras; o Synse converteu para quilos.')
  }

  const origem: FieldOriginMap = {}
  const medida: BodyMeasurement = {
    clientId: contexto.clientId,
    measuredAt: escolherInstante(leitura, contexto).toISOString(),
    source: contexto.source ?? 'BLUETOOTH_SCALE',
    deviceId: contexto.deviceId ?? null,
    weightKg: arredondar(peso, 3),
    fieldOrigin: origem,
    rawPayload: { hex: leitura.rawHex, scaleUserId: leitura.scaleUserId ?? null },
  }
  origem.weightKg = 'MEASURED'

  /*
   * A impedância é a outra grandeza que o aparelho realmente lê. Guardá-la
   * bruta é o que permitirá recalcular a composição no futuro, se algum dia o
   * Synse adotar uma fórmula validada e publicada.
   */
  if (leitura.impedanceOhm !== undefined) {
    medida.impedanceOhm = arredondar(leitura.impedanceOhm, 1)
    origem.impedanceOhm = 'MEASURED'
  } else {
    origem.impedanceOhm = 'ABSENT'
  }

  if (leitura.unsuccessful) {
    /*
     * Peso veio, composição não. É o caso do pé seco ou da meia: a célula de
     * carga funciona, a corrente não passa. A pesagem vale; a estimativa, não.
     */
    avisos.push('A balança não conseguiu estimar a composição corporal desta vez.')
  }

  if (leitura.bodyFatPercent !== undefined) {
    medida.bodyFatPercent = arredondar(leitura.bodyFatPercent, 2)
    origem.bodyFatPercent = 'ESTIMATED'
  } else {
    origem.bodyFatPercent = 'ABSENT'
  }

  // Massa muscular: a balança manda em quilo, ou em porcentagem, ou nenhum dos dois.
  if (leitura.muscleMassKg !== undefined) {
    medida.muscleMassKg = arredondar(leitura.muscleMassKg, 3)
    origem.muscleMassKg = 'ESTIMATED'
  } else if (leitura.musclePercent !== undefined) {
    medida.muscleMassKg = arredondar((leitura.musclePercent / 100) * peso, 3)
    origem.muscleMassKg = 'CALCULATED'
  } else {
    origem.muscleMassKg = 'ABSENT'
  }

  /*
   * "Massa livre de gordura" é o nome do SIG para o que o produto chama massa
   * magra. A massa magra mole (`softLeanMass`) exclui osso, e é a que menos
   * balança informa — só entra se a outra faltar, e com aviso.
   */
  if (leitura.fatFreeMassKg !== undefined) {
    medida.leanMassKg = arredondar(leitura.fatFreeMassKg, 3)
    origem.leanMassKg = 'ESTIMATED'
  } else if (leitura.softLeanMassKg !== undefined) {
    medida.leanMassKg = arredondar(leitura.softLeanMassKg, 3)
    origem.leanMassKg = 'ESTIMATED'
    avisos.push('Massa magra informada sem o osso (massa magra mole).')
  } else {
    origem.leanMassKg = 'ABSENT'
  }

  /*
   * O padrão transmite água em QUILO; o Synse guarda em PORCENTAGEM, que é o
   * que a pessoa reconhece. A divisão pelo peso é conta do Synse, e por isso
   * o campo sai como calculado, não como estimado pela balança.
   */
  if (leitura.bodyWaterMassKg !== undefined) {
    const percentual = (leitura.bodyWaterMassKg / peso) * 100
    if (percentual > 0 && percentual <= 100) {
      medida.bodyWaterPercent = arredondar(percentual, 2)
      origem.bodyWaterPercent = 'CALCULATED'
    } else {
      origem.bodyWaterPercent = 'ABSENT'
      avisos.push('A água corporal informada não fecha com o peso; foi descartada.')
    }
  } else {
    origem.bodyWaterPercent = 'ABSENT'
  }

  if (leitura.basalMetabolismKcal !== undefined) {
    medida.bmrKcal = Math.round(leitura.basalMetabolismKcal)
    origem.bmrKcal = 'ESTIMATED'
  } else {
    origem.bmrKcal = 'ABSENT'
  }

  const imc = calcularImc(peso, leitura, contexto)
  if (imc) {
    medida.bmi = imc.valor
    origem.bmi = 'CALCULATED'
    if (imc.aviso) avisos.push(imc.aviso)
  } else {
    origem.bmi = 'ABSENT'
  }

  /*
   * Gordura visceral e massa óssea não existem no padrão Bluetooth SIG. Quando
   * uma balança mostra esses números no app do fabricante, eles vêm por
   * protocolo proprietário. Ficam ausentes até haver um provider que os leia
   * com o aparelho na mesa.
   */
  origem.visceralFat = 'ABSENT'
  origem.boneMassKg = 'ABSENT'

  return { ok: true, measurement: medida, warnings: avisos }
}

/**
 * Qual relógio vale.
 *
 * O da balança, quando ele é plausível — é o instante em que a pessoa subiu,
 * e para uma balança que guarda pesagens offline pode ser de dias atrás. O do
 * celular quando o da balança não presta, que é o caso comum em aparelho que
 * volta de fábrica sem hora certa.
 */
function escolherInstante(leitura: ParsedScaleReading, contexto: NormalizationContext): Date {
  const agora = contexto.now ?? new Date()
  if (!leitura.measuredAt) return agora

  const carimbo = leitura.measuredAt.getTime()
  const umAnoAtras = agora.getTime() - 365 * 24 * 60 * 60 * 1000
  // Uma hora de folga absorve relógio adiantado e fuso mal resolvido.
  const limiteFuturo = agora.getTime() + 60 * 60 * 1000

  return carimbo >= umAnoAtras && carimbo <= limiteFuturo ? leitura.measuredAt : agora
}

/**
 * IMC.
 *
 * A balança até pode mandar o dela, e ela mesma calculou — a partir de uma
 * altura que alguém digitou no app do fabricante, que pode estar
 * desatualizada. Quando o Synse tem a altura do perfil, ele refaz a conta com
 * o dado que o próprio produto mantém.
 */
function calcularImc(
  peso: number,
  leitura: ParsedScaleReading,
  contexto: NormalizationContext,
): { valor: number; aviso?: string } | null {
  const altura = contexto.heightM ?? leitura.heightM ?? null

  if (altura !== null && altura >= ALTURA_MINIMA_M && altura <= ALTURA_MAXIMA_M) {
    return { valor: arredondar(peso / (altura * altura), 2) }
  }

  if (leitura.bmi !== undefined) {
    return {
      valor: arredondar(leitura.bmi, 2),
      aviso: 'IMC informado pela balança: foi calculado com a altura cadastrada nela.',
    }
  }

  return null
}

/**
 * Entrada digitada à mão.
 *
 * Passa pelas mesmas faixas da leitura da balança — um dedo escorregado no
 * teclado erra mais do que uma célula de carga. E marca tudo como `MEASURED`
 * só onde faz sentido: quem digitou o peso mediu numa balança qualquer; quem
 * digita gordura corporal está copiando de algum outro lugar.
 */
export function normalizeManualEntry(
  entrada: { weightKg: number; bodyFatPercent?: number | null; measuredAt?: string },
  contexto: NormalizationContext,
): NormalizedResult {
  const peso = Number(entrada.weightKg)

  if (!Number.isFinite(peso) || peso <= 0) {
    return { ok: false, reason: 'SEM_PESO', message: 'Informe o peso.' }
  }
  if (peso < PESO_MINIMO_KG || peso > PESO_MAXIMO_KG) {
    return {
      ok: false,
      reason: 'PESO_IMPLAUSIVEL',
      message: `Peso fora da faixa aceita: ${arredondar(peso, 2)} kg.`,
    }
  }

  const origem: FieldOriginMap = { weightKg: 'MEASURED' }
  const medida: BodyMeasurement = {
    clientId: contexto.clientId,
    measuredAt: entrada.measuredAt ?? (contexto.now ?? new Date()).toISOString(),
    source: 'MANUAL',
    deviceId: null,
    weightKg: arredondar(peso, 3),
    fieldOrigin: origem,
    rawPayload: null,
  }

  const gordura = entrada.bodyFatPercent
  if (gordura !== undefined && gordura !== null && Number.isFinite(Number(gordura))) {
    const valor = Number(gordura)
    if (valor > 0 && valor < 100) {
      medida.bodyFatPercent = arredondar(valor, 2)
      origem.bodyFatPercent = 'ESTIMATED'
    }
  }

  const altura = contexto.heightM
  if (altura && altura >= ALTURA_MINIMA_M && altura <= ALTURA_MAXIMA_M) {
    medida.bmi = arredondar(peso / (altura * altura), 2)
    origem.bmi = 'CALCULATED'
  }

  return { ok: true, measurement: medida, warnings: [] }
}
