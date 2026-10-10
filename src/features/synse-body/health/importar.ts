import {
  type AmostraDeSaude,
  type FonteDeSaudeId,
  TETO_DE_AMOSTRAS,
  janelaDeImportacao,
} from '@/features/synse-body/health/amostra'
import {
  type FalhaDoGrupo,
  agruparEmPesagens,
  normalizarGrupo,
  pesagemJaExiste,
} from '@/features/synse-body/health/normalizar'
import type { BodyMeasurement } from '@/types/domain'

/**
 * A importação, decidida fora do navegador.
 *
 * Esta função não toca em Capacitor, em React nem em rede: recebe as amostras
 * já lidas e o histórico que o app tem em mãos, e devolve o que deve subir.
 * É o que permite testar a importação inteira — inclusive o caso de a mesma
 * pesagem já ter entrado pelo Bluetooth — sem um iPhone na mesa.
 */

export type PlanoDeImportacao = {
  /** O que vai subir, na ordem em que foi medido. */
  aEnviar: BodyMeasurement[]
  /** Quantas pesagens já estavam no histórico. */
  jaExistiam: number
  /** Quantos grupos foram recusados, e por quê. */
  recusadas: Record<FalhaDoGrupo, number>
  /** Avisos de normalização, sem repetição, para a tela mostrar. */
  avisos: string[]
  /**
   * A leitura bateu no teto?
   *
   * Importa para a tela: com o teto batido, a janela não cobriu tudo e a
   * próxima sincronização vai continuar de onde esta parou. Dizer "importamos
   * 2.000" sem dizer "há mais" faria a pessoa achar que acabou.
   */
  atingiuOTeto: boolean
}

const SEM_RECUSA: Record<FalhaDoGrupo, number> = {
  PESO_IMPLAUSIVEL: 0,
  INSTANTE_INVALIDO: 0,
  ECO_DO_SYNSE: 0,
}

export function planejarImportacao(entrada: {
  amostras: readonly AmostraDeSaude[]
  fonte: FonteDeSaudeId
  alturaM?: number | null
  /** O que o app já tem, para não importar de novo o que entrou por outro caminho. */
  jaNoHistorico: readonly Pick<BodyMeasurement, 'measuredAt' | 'weightKg' | 'clientId'>[]
}): PlanoDeImportacao {
  const recusadas = { ...SEM_RECUSA }
  const avisos = new Set<string>()
  const aEnviar: BodyMeasurement[] = []
  let jaExistiam = 0

  const grupos = agruparEmPesagens(entrada.amostras)

  for (const grupo of grupos) {
    const resultado = normalizarGrupo(grupo, {
      fonte: entrada.fonte,
      alturaM: entrada.alturaM,
    })

    if (!resultado.ok) {
      recusadas[resultado.motivo] += 1
      continue
    }

    /*
     * A comparação é contra o histórico **mais o que já entrou nesta rodada**:
     * sem isso, duas amostras de peso a segundos uma da outra — que a
     * plataforma guarda quando dois apps escrevem a mesma pesagem — virariam
     * duas linhas, e a checagem contra o banco não pegaria porque nenhuma das
     * duas está lá ainda.
     */
    if (pesagemJaExiste(resultado.measurement, [...entrada.jaNoHistorico, ...aEnviar])) {
      jaExistiam += 1
      continue
    }

    for (const aviso of resultado.avisos) avisos.add(aviso)
    aEnviar.push(resultado.measurement)
  }

  aEnviar.sort((a, b) => Date.parse(a.measuredAt) - Date.parse(b.measuredAt))

  return {
    aEnviar,
    jaExistiam,
    recusadas,
    avisos: [...avisos],
    atingiuOTeto: entrada.amostras.length >= TETO_DE_AMOSTRAS,
  }
}

/** A janela que a próxima leitura deve pedir ao nativo. */
export function janelaParaLer(opcoes: { ultimaImportadaEm?: string | null; agora?: Date }): {
  from: string
  to: string
  limit: number
  primeiraVez: boolean
} {
  const janela = janelaDeImportacao(opcoes)
  return {
    from: janela.de.toISOString(),
    to: janela.ate.toISOString(),
    limit: TETO_DE_AMOSTRAS,
    primeiraVez: janela.primeiraVez,
  }
}
