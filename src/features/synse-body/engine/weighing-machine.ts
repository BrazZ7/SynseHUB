import type { BodyMeasurement, ParsedScaleReading, WeighingState } from './types'

/**
 * A experiência de subir na balança.
 *
 * Existe porque o aparelho não avisa quando o número virou verdade. Balança
 * que transmite ao vivo manda dezenas de leituras enquanto a pessoa se
 * equilibra: 68,2 · 71,9 · 70,4 · 70,3 · 70,3. Gravar a primeira grava o
 * desequilíbrio; gravar todas enche o histórico de lixo.
 *
 * A estabilidade aqui é decidida por concordância entre leituras seguidas —
 * não por adivinhação. E a balança que manda uma leitura só (o padrão manda
 * a pesagem já finalizada) é atendida pelo silêncio: parou de chegar, é
 * porque acabou.
 */

export type WeighingConfig = {
  /** Quantas leituras seguidas precisam concordar. */
  amostrasParaEstabilizar: number
  /** O quanto elas podem variar entre si, em quilo. */
  toleranciaKg: number
  /** Silêncio depois do qual a última leitura é considerada final. */
  silencioFinalMs: number
  /** Teto da pesagem inteira. Sem ele a tela fica girando para sempre. */
  timeoutMs: number
}

export const CONFIG_PADRAO: WeighingConfig = {
  amostrasParaEstabilizar: 3,
  toleranciaKg: 0.2,
  /*
   * 1,5 s: mais curto pegaria a pausa entre dois pacotes de uma medição
   * partida como fim da pesagem; mais longo faria a tela parecer travada.
   */
  silencioFinalMs: 1500,
  timeoutMs: 45_000,
}

export type Amostra = { pesoKg: number; em: number }

export type WeighingSnapshot = {
  estado: WeighingState
  /** O peso que a tela mostra agora, subindo e descendo com a pessoa. */
  pesoAtualKg: number | null
  amostras: Amostra[]
  leituraFinal: ParsedScaleReading | null
  medida: BodyMeasurement | null
  erro: string | null
  avisos: string[]
  iniciadoEm: number | null
}

export type WeighingEvent =
  | { tipo: 'INICIAR'; em: number }
  | { tipo: 'LEITURA'; leitura: ParsedScaleReading; em: number }
  | { tipo: 'TEMPO'; em: number }
  | { tipo: 'SINCRONIZAR' }
  | { tipo: 'SINCRONIZADO'; medida: BodyMeasurement }
  | { tipo: 'FALHA'; mensagem: string }
  | { tipo: 'REINICIAR' }

export const ESTADO_INICIAL: WeighingSnapshot = {
  estado: 'AGUARDANDO',
  pesoAtualKg: null,
  amostras: [],
  leituraFinal: null,
  medida: null,
  erro: null,
  avisos: [],
  iniciadoEm: null,
}

/** As últimas leituras concordam entre si dentro da tolerância? */
function concordam(amostras: Amostra[], config: WeighingConfig): boolean {
  if (!amostras.length) return false

  const pesos = amostras.slice(-config.amostrasParaEstabilizar).map((a) => a.pesoKg)
  return Math.max(...pesos) - Math.min(...pesos) <= config.toleranciaKg
}

function estabilizou(amostras: Amostra[], config: WeighingConfig): boolean {
  return amostras.length >= config.amostrasParaEstabilizar && concordam(amostras, config)
}

/**
 * O reducer.
 *
 * Puro de propósito: é o que permite testar a pesagem inteira — instabilidade,
 * estabilização, silêncio, timeout — sem balança e sem Bluetooth.
 */
export function weighingReducer(
  estado: WeighingSnapshot,
  evento: WeighingEvent,
  config: WeighingConfig = CONFIG_PADRAO,
): WeighingSnapshot {
  switch (evento.tipo) {
    case 'INICIAR':
      return { ...ESTADO_INICIAL, estado: 'AGUARDANDO', iniciadoEm: evento.em }

    case 'REINICIAR':
      return { ...ESTADO_INICIAL }

    case 'LEITURA': {
      if (estado.estado === 'SINCRONIZANDO' || estado.estado === 'CONCLUIDO') return estado

      const { leitura } = evento

      /*
       * Pacote que continua noutro não é leitura: é metade de uma. Mantém a
       * tela em MEDINDO e espera o resto, em vez de mostrar meio número.
       */
      if (leitura.continues) {
        return { ...estado, estado: 'MEDINDO', leituraFinal: leitura }
      }

      if (leitura.weightKg === undefined) {
        // Medição malsucedida com peso ausente: a pessoa precisa subir de novo.
        return leitura.unsuccessful
          ? {
              ...estado,
              estado: 'ERRO',
              erro: 'A balança não concluiu a medição. Suba novamente, com os pés secos.',
            }
          : estado
      }

      const amostras = [...estado.amostras, { pesoKg: leitura.weightKg, em: evento.em }].slice(-12)
      const firme = estabilizou(amostras, config)

      return {
        ...estado,
        estado: firme ? 'ESTAVEL' : amostras.length === 1 ? 'MEDINDO' : 'INSTAVEL',
        pesoAtualKg: leitura.weightKg,
        amostras,
        leituraFinal: leitura,
        erro: null,
        iniciadoEm: estado.iniciadoEm ?? evento.em,
      }
    }

    case 'TEMPO': {
      if (estado.estado === 'CONCLUIDO' || estado.estado === 'ERRO') return estado

      const ultima = estado.amostras.at(-1)

      /*
       * Silêncio depois de pelo menos uma leitura completa: é a balança que
       * manda a pesagem já finalizada, como o padrão prevê. Uma leitura só
       * nunca "concorda com as seguintes", e sem esta regra ela ficaria presa
       * em MEDINDO até o timeout.
       *
       * Mas só fecha se as leituras concordarem. Silêncio no meio de uma
       * pesagem que oscilava é conexão caindo, não medição pronta — fechar ali
       * gravaria o peso da pessoa se apoiando na parede como se fosse o dela.
       */
      if (ultima && evento.em - ultima.em >= config.silencioFinalMs) {
        if (estado.leituraFinal?.continues) {
          return {
            ...estado,
            estado: 'ERRO',
            erro: 'A balança interrompeu o envio no meio da medição.',
          }
        }
        if (concordam(estado.amostras, config)) {
          return { ...estado, estado: 'ESTAVEL' }
        }
      }

      if (estado.iniciadoEm !== null && evento.em - estado.iniciadoEm >= config.timeoutMs) {
        return {
          ...estado,
          estado: 'ERRO',
          erro: ultima
            ? 'A medição não estabilizou. Fique parado sobre a balança e tente de novo.'
            : 'A balança não enviou nenhuma leitura. Confira se ela está ligada e por perto.',
        }
      }

      return estado
    }

    case 'SINCRONIZAR':
      if (estado.estado !== 'ESTAVEL') return estado
      return { ...estado, estado: 'SINCRONIZANDO', erro: null }

    case 'SINCRONIZADO':
      return { ...estado, estado: 'CONCLUIDO', medida: evento.medida, erro: null }

    case 'FALHA':
      return { ...estado, estado: 'ERRO', erro: evento.mensagem }

    default:
      return estado
  }
}

/** O texto que a tela mostra em cada estado. */
export const TEXTO_DO_ESTADO: Record<WeighingState, string> = {
  AGUARDANDO: 'Suba na balança descalço',
  MEDINDO: 'Medindo…',
  INSTAVEL: 'Fique parado',
  ESTAVEL: 'Pronto',
  SINCRONIZANDO: 'Salvando…',
  CONCLUIDO: 'Medição salva',
  ERRO: 'Não deu certo',
}
