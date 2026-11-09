import {
  type AmostraDeSaude,
  type FonteDeSaudeId,
  SOURCE_DA_FONTE,
  type TipoDeAmostra,
  clientIdDaAmostra,
  ehEcoDoSynse,
} from '@/features/synse-body/health/amostra'
import type { BodyMeasurement, FieldOriginMap } from '@/types/domain'

/**
 * ── De amostras soltas para uma pesagem ──────────────────────────────────────
 *
 * A plataforma de saúde guarda peso, gordura e massa magra como registros
 * independentes. Uma subida na balança vira cinco ou seis deles, com o mesmo
 * instante. Remontar é o trabalho daqui.
 *
 * O peso é a âncora, e não um detalhe de implementação: o banco recusa
 * `weight_kg` nulo, e com razão — "22% de gordura" sem peso não é uma pesagem,
 * é um número solto. Grupo sem peso é descartado com motivo, nunca gravado
 * pela metade.
 */

/**
 * O quanto dois registros podem distar e ainda serem a mesma subida na balança.
 *
 * Dez segundos. A balança escreve as amostras de uma pesagem em sequência, e
 * na prática elas saem no mesmo instante — mas há aparelho que grava o peso ao
 * estabilizar e a composição alguns segundos depois, quando a bioimpedância
 * termina. Dois segundos (a janela do BLE) perderia esses.
 *
 * Para cima há um limite natural: ninguém sobe na balança, desce e sobe de
 * novo em menos de dez segundos para obter uma leitura **diferente** que queira
 * ver separada no histórico.
 */
export const JANELA_DO_GRUPO_MS = 10_000

/** Um conjunto de amostras que o Synse lê como uma pesagem só. */
export type GrupoDeAmostras = {
  /** A amostra de peso, que ancora o grupo e dá o `clientId`. */
  peso: AmostraDeSaude
  acompanhantes: AmostraDeSaude[]
}

/**
 * Agrupa as amostras em pesagens.
 *
 * Ordena por instante e caminha uma vez: cada amostra de peso abre um grupo, e
 * as de outros tipos entram no grupo de peso mais próximo dentro da janela.
 *
 * Amostra sem grupo de peso por perto é descartada em silêncio, e isto é
 * intencional: alguém que anota só o percentual de gordura num app de dieta
 * não está registrando uma pesagem, e inventar um peso para acomodar o número
 * seria pior do que ignorá-lo.
 */
export function agruparEmPesagens(amostras: readonly AmostraDeSaude[]): GrupoDeAmostras[] {
  const ordenadas = [...amostras].sort(
    (a, b) => instante(a) - instante(b) || a.idNaPlataforma.localeCompare(b.idNaPlataforma),
  )

  const grupos: GrupoDeAmostras[] = []
  for (const amostra of ordenadas) {
    if (amostra.tipo === 'PESO') grupos.push({ peso: amostra, acompanhantes: [] })
  }
  if (grupos.length === 0) return []

  for (const amostra of ordenadas) {
    if (amostra.tipo === 'PESO') continue

    const alvo = grupoMaisProximo(grupos, instante(amostra))
    if (alvo) alvo.acompanhantes.push(amostra)
  }

  return grupos
}

function instante(amostra: AmostraDeSaude): number {
  return new Date(amostra.medidaEm).getTime()
}

function grupoMaisProximo(grupos: GrupoDeAmostras[], quando: number): GrupoDeAmostras | null {
  let melhor: GrupoDeAmostras | null = null
  let menorDistancia = Number.POSITIVE_INFINITY

  for (const grupo of grupos) {
    const distancia = Math.abs(instante(grupo.peso) - quando)
    if (distancia <= JANELA_DO_GRUPO_MS && distancia < menorDistancia) {
      melhor = grupo
      menorDistancia = distancia
    }
  }

  return melhor
}

/*
 * Os limites de plausibilidade, os mesmos do caminho Bluetooth.
 *
 * Repetidos aqui e não importados de `engine/normalize.ts` porque lá eles são
 * privados do módulo; o teste `tests/unit/synse-body/saude-normalizar.test.ts`
 * compara os dois para não divergirem.
 */
export const PESO_MINIMO_KG = 2
export const PESO_MAXIMO_KG = 400

export type FalhaDoGrupo = 'PESO_IMPLAUSIVEL' | 'INSTANTE_INVALIDO' | 'ECO_DO_SYNSE'

export type ResultadoDoGrupo =
  | { ok: true; measurement: BodyMeasurement; avisos: string[] }
  | { ok: false; motivo: FalhaDoGrupo; mensagem: string }

const arredondar = (valor: number, casas: number) => {
  const fator = 10 ** casas
  return Math.round(valor * fator) / fator
}

/**
 * O grupo vira medição.
 *
 * ── Por que quase tudo sai como `ESTIMATED` ──────────────────────────────────
 *
 * A plataforma de saúde entrega o número, não a procedência dele. Gordura,
 * massa magra, massa óssea e metabolismo basal vêm de bioimpedância — fórmula
 * proprietária de um fabricante que ninguém publica. Chamar isso de medição
 * seria mentir sobre a precisão de um número que a pessoa usa para decidir
 * sobre o próprio corpo, que é a mesma razão pela qual o caminho Bluetooth
 * também marca esses campos como estimativa.
 *
 * O peso é a exceção, e sai como `MEASURED`: ele vem de uma célula de carga,
 * ou foi digitado por alguém. Nos dois casos é um valor observado, não
 * inferido.
 */
export function normalizarGrupo(
  grupo: GrupoDeAmostras,
  contexto: { fonte: FonteDeSaudeId; alturaM?: number | null },
): ResultadoDoGrupo {
  if (ehEcoDoSynse(grupo.peso)) {
    return {
      ok: false,
      motivo: 'ECO_DO_SYNSE',
      mensagem: 'Esta pesagem foi o próprio Synse que escreveu.',
    }
  }

  const quando = new Date(grupo.peso.medidaEm)
  if (Number.isNaN(quando.getTime())) {
    return { ok: false, motivo: 'INSTANTE_INVALIDO', mensagem: 'Amostra sem instante legível.' }
  }

  const peso = grupo.peso.valor
  if (!Number.isFinite(peso) || peso < PESO_MINIMO_KG || peso > PESO_MAXIMO_KG) {
    return {
      ok: false,
      motivo: 'PESO_IMPLAUSIVEL',
      mensagem: `Peso fora do que uma balança de pessoa mede: ${arredondar(peso, 2)} kg.`,
    }
  }

  const avisos: string[] = []
  const origem: FieldOriginMap = { weightKg: 'MEASURED' }
  const medida: BodyMeasurement = {
    clientId: clientIdDaAmostra(contexto.fonte, grupo.peso.idNaPlataforma),
    measuredAt: quando.toISOString(),
    source: SOURCE_DA_FONTE[contexto.fonte],
    /*
     * Sem aparelho, e isto não é omissão. `user_devices` guarda balança
     * pareada por Bluetooth **por esta pessoa**; o que veio da plataforma de
     * saúde foi escrito por outro app, de um aparelho que o Synse nunca viu.
     * Inventar um vínculo faria o histórico do aparelho mentir.
     */
    deviceId: null,
    weightKg: arredondar(peso, 3),
    fieldOrigin: origem,
    rawPayload: {
      fonte: contexto.fonte,
      appDeOrigem: grupo.peso.appDeOrigem,
      aparelhoDeOrigem: grupo.peso.aparelhoDeOrigem,
      amostras: [grupo.peso, ...grupo.acompanhantes].map((a) => ({
        id: a.idNaPlataforma,
        tipo: a.tipo,
        valor: a.valor,
      })),
    },
  }

  const porTipo = new Map<TipoDeAmostra, AmostraDeSaude>()
  for (const acompanhante of grupo.acompanhantes) {
    /*
     * Dois apps podem ter escrito o mesmo tipo para o mesmo instante — a
     * balança e um app de dieta, por exemplo. Fica o primeiro, que depois da
     * ordenação é o mais próximo do peso no tempo. Escolher pela média
     * inventaria um número que nenhum dos dois mediu.
     */
    if (!porTipo.has(acompanhante.tipo)) porTipo.set(acompanhante.tipo, acompanhante)
    else avisos.push(`Mais de um registro de ${rotulo(acompanhante.tipo)} neste instante.`)
  }

  const gordura = porTipo.get('GORDURA_PERCENTUAL')
  if (gordura && gordura.valor > 0 && gordura.valor <= 100) {
    medida.bodyFatPercent = arredondar(gordura.valor, 2)
    origem.bodyFatPercent = 'ESTIMATED'
  } else {
    origem.bodyFatPercent = 'ABSENT'
    if (gordura) avisos.push('Percentual de gordura fora de 0 a 100; foi descartado.')
  }

  const magra = porTipo.get('MASSA_MAGRA')
  if (magra && magra.valor > 0 && magra.valor <= peso) {
    medida.leanMassKg = arredondar(magra.valor, 3)
    origem.leanMassKg = 'ESTIMATED'
  } else {
    origem.leanMassKg = 'ABSENT'
    // Massa magra maior que o peso é erro de unidade de quem escreveu, não dado.
    if (magra) avisos.push('Massa magra incompatível com o peso; foi descartada.')
  }

  const ossea = porTipo.get('MASSA_OSSEA')
  if (ossea && ossea.valor > 0 && ossea.valor <= peso) {
    medida.boneMassKg = arredondar(ossea.valor, 3)
    origem.boneMassKg = 'ESTIMATED'
  } else {
    origem.boneMassKg = 'ABSENT'
    if (ossea) avisos.push('Massa óssea incompatível com o peso; foi descartada.')
  }

  /*
   * Água corporal: a plataforma entrega **quilo**, o Synse guarda percentual.
   * A mesma armadilha do padrão Bluetooth, e a mesma resposta — a divisão é
   * conta do Synse, então o campo sai como calculado, não como estimado.
   */
  const agua = porTipo.get('AGUA_CORPORAL')
  if (agua) {
    const percentual = (agua.valor / peso) * 100
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

  const metabolismo = porTipo.get('METABOLISMO_BASAL')
  if (metabolismo && metabolismo.valor > 0) {
    medida.bmrKcal = Math.round(metabolismo.valor)
    origem.bmrKcal = 'ESTIMATED'
  } else {
    origem.bmrKcal = 'ABSENT'
  }

  /*
   * ── O IMC é recalculado, e o da plataforma é descartado ───────────────────
   *
   * A altura é do perfil do Synse e é a mesma que o resto do produto usa. O
   * IMC que vem da plataforma foi calculado com a altura que **outro app**
   * tinha cadastrada, que pode estar desatualizada ou nem existir — e dois
   * IMCs diferentes para o mesmo peso, na mesma tela, é o tipo de coisa que
   * destrói a confiança no número inteiro.
   *
   * Sem altura no perfil, fica ausente. Usar o da plataforma seria mostrar um
   * número que o Synse não sabe reproduzir.
   */
  const alturaM = contexto.alturaM
  if (alturaM && alturaM >= 0.5 && alturaM <= 2.6) {
    medida.bmi = arredondar(peso / (alturaM * alturaM), 2)
    origem.bmi = 'CALCULATED'
    if (porTipo.has('IMC')) {
      const daPlataforma = porTipo.get('IMC')!.valor
      if (Math.abs(daPlataforma - medida.bmi) > 1) {
        avisos.push(
          `O IMC da plataforma (${arredondar(daPlataforma, 1)}) difere do calculado com a sua altura.`,
        )
      }
    }
  } else {
    origem.bmi = 'ABSENT'
    if (porTipo.has('IMC')) {
      avisos.push('Informe sua altura no perfil para o Synse calcular o IMC.')
    }
  }

  // A plataforma não transmite impedância bruta: nenhuma das duas tem o tipo.
  origem.impedanceOhm = 'ABSENT'

  return { ok: true, measurement: medida, avisos }
}

function rotulo(tipo: TipoDeAmostra): string {
  const nomes: Record<TipoDeAmostra, string> = {
    PESO: 'peso',
    GORDURA_PERCENTUAL: 'gordura corporal',
    MASSA_MAGRA: 'massa magra',
    MASSA_OSSEA: 'massa óssea',
    AGUA_CORPORAL: 'água corporal',
    IMC: 'IMC',
    METABOLISMO_BASAL: 'metabolismo basal',
  }
  return nomes[tipo]
}

/**
 * ── A mesma subida na balança, por dois caminhos ─────────────────────────────
 *
 * `ehEcoDoSynse` resolve o laço — o que o Synse escreveu na plataforma não
 * volta. Falta o caso inverso: a balança fala Bluetooth **e** sincroniza com a
 * plataforma pelo app do fabricante. A pesagem chega duas vezes, por caminhos
 * diferentes, com `clientId` diferente — o banco não tem como saber que é a
 * mesma, e o histórico mostraria a pessoa subindo duas vezes na balança.
 *
 * A regra é conservadora de propósito: só pula quando já existe uma pesagem
 * **muito** perto no tempo e praticamente no mesmo peso. Duas subidas de
 * verdade, para conferir, levam mais de um minuto e variam mais que 100
 * gramas; errar para o lado de importar demais deixa uma linha a mais que a
 * pessoa pode apagar, e errar para o outro some com uma pesagem que ela fez.
 */
export const JANELA_DE_CONFLITO_MS = 60_000
export const TOLERANCIA_DE_CONFLITO_KG = 0.1

export function pesagemJaExiste(
  nova: Pick<BodyMeasurement, 'measuredAt' | 'weightKg' | 'clientId'>,
  existentes: readonly Pick<BodyMeasurement, 'measuredAt' | 'weightKg' | 'clientId'>[],
): boolean {
  const quando = new Date(nova.measuredAt).getTime()

  return existentes.some((antiga) => {
    // O mesmo `clientId` o banco já resolve; aqui ele poupa a viagem de rede.
    if (antiga.clientId === nova.clientId) return true

    const distancia = Math.abs(new Date(antiga.measuredAt).getTime() - quando)
    if (!Number.isFinite(distancia) || distancia > JANELA_DE_CONFLITO_MS) return false

    return Math.abs(antiga.weightKg - nova.weightKg) <= TOLERANCIA_DE_CONFLITO_KG
  })
}
