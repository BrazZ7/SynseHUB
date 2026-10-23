'use client'

import type { AmostraDeSaude, FonteDeSaudeId, TipoDeAmostra } from '@/features/synse-body/health/amostra'

/**
 * A ponte para o plugin de saúde, quando ele existir.
 *
 * Mesmo desenho da ponte do Treino Ativo: o contrato fecha aqui, antes de o
 * invólucro nativo existir, e a detecção é por **presença**. Se o objeto não
 * estiver na janela, não há plugin rodando e a tela diz isso em vez de tentar.
 *
 * O plugin vive em `native/synse-health` e o Capacitor o registra como
 * `SynseHealth`.
 */

/** O espelho do contrato de `native/synse-health/src/definitions.ts`. */
export type AmostraNativa = {
  id: string
  type: TipoDeAmostra
  value: number
  measuredAt: string
  sourceApp: string | null
  sourceDevice: string | null
}

export type Disponibilidade = {
  available: boolean
  provider: FonteDeSaudeId | null
  reason?: 'UNSUPPORTED_PLATFORM' | 'NEEDS_INSTALL' | 'NO_HEALTH_DATA'
}

export type ResultadoDePermissao = {
  granted: boolean
  /**
   * A plataforma sabe dizer se a leitura foi autorizada?
   *
   * O Health Connect sabe. O HealthKit, por projeto, não revela negativa de
   * leitura — se revelasse, um app deduziria uma condição de saúde pelo que a
   * pessoa escondeu. No iOS isto vem `false`, e a tela precisa falar de outro
   * jeito: não "autorizado", e sim "se não aparecer nada, confira no Saúde".
   */
  authoritative: boolean
}

type PluginDeSaude = {
  isAvailable(): Promise<Disponibilidade>
  requestPermissions(): Promise<ResultadoDePermissao>
  openSettings(): Promise<void>
  readSamples(opcoes: { from: string; to: string; limit: number }): Promise<{
    samples: AmostraNativa[]
  }>
}

type JanelaComCapacitor = Window & {
  Capacitor?: {
    getPlatform?: () => string
    isNativePlatform?: () => boolean
    Plugins?: Record<string, unknown>
  }
}

export function pluginDeSaude(): PluginDeSaude | null {
  if (typeof window === 'undefined') return null
  const capacitor = (window as JanelaComCapacitor).Capacitor
  if (!capacitor?.isNativePlatform?.()) return null
  return (capacitor.Plugins?.SynseHealth as PluginDeSaude | undefined) ?? null
}

/**
 * Onde o Synse está rodando, do ponto de vista de saúde.
 *
 * `null` é o navegador — e no navegador **não existe** leitura de plataforma
 * de saúde. Nem o Apple Saúde nem o Health Connect têm API web: são dados de
 * saúde guardados no aparelho, e nenhuma das duas plataformas expõe isso a uma
 * página. Não é limitação do Synse nem coisa que um dia a gente contorne com
 * mais código; é como as duas plataformas foram desenhadas.
 */
export function fonteDaPlataforma(): FonteDeSaudeId | null {
  if (typeof window === 'undefined') return null
  const nome = (window as JanelaComCapacitor).Capacitor?.getPlatform?.()
  if (nome === 'ios') return 'apple_health'
  if (nome === 'android') return 'health_connect'
  return null
}

/**
 * A amostra do nativo, no vocabulário do Synse.
 *
 * Sem `as`: o retorno é tipado e o compilador confere campo a campo. Um cast
 * aqui calaria exatamente o erro que esta função existe para não cometer — um
 * campo renomeado de um lado e esquecido do outro passaria como `undefined`
 * até alguém não ver o percentual de gordura na tela.
 */
export function comoAmostra(nativa: AmostraNativa): AmostraDeSaude {
  return {
    idNaPlataforma: nativa.id,
    tipo: nativa.type,
    valor: nativa.value,
    medidaEm: nativa.measuredAt,
    appDeOrigem: nativa.sourceApp,
    aparelhoDeOrigem: nativa.sourceDevice,
  }
}
