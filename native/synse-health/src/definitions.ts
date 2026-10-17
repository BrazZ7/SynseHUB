/**
 * O contrato do plugin de saúde, em TypeScript.
 *
 * Duplica de propósito o tipo de `src/features/synse-body/health/ponte.ts` —
 * este pacote é publicável sozinho e não pode importar da aplicação. O teste
 * `tests/unit/synse-body/saude-contrato.test.ts` compara os dois, então eles
 * não divergem em silêncio.
 */

/** Os tipos que o Synse pede às plataformas de saúde. */
export type HealthSampleType =
  | 'PESO'
  | 'GORDURA_PERCENTUAL'
  | 'MASSA_MAGRA'
  | 'MASSA_OSSEA'
  | 'AGUA_CORPORAL'
  | 'IMC'
  | 'METABOLISMO_BASAL'

/**
 * Uma amostra, **já convertida** para a unidade do Synse pelo lado nativo.
 *
 * A conversão fica no nativo porque é lá que as duas plataformas divergem:
 * a Apple entrega gordura como fração (0,22), o Health Connect como percentual
 * (22,0). Converter na web significaria a web precisar saber de qual
 * plataforma veio cada número — exatamente o acoplamento que este plugin
 * existe para evitar.
 */
export interface HealthSample {
  /** O identificador da amostra na plataforma. É ele que torna a reimportação idempotente. */
  id: string
  type: HealthSampleType
  /** kg, exceto: GORDURA_PERCENTUAL em 0–100, IMC em kg/m², METABOLISMO_BASAL em kcal/dia. */
  value: number
  /** ISO 8601. */
  measuredAt: string
  /** Nome do app que escreveu a amostra. */
  sourceApp: string | null
  /** Nome do aparelho, quando a plataforma o associa. */
  sourceDevice: string | null
}

export interface HealthAvailability {
  available: boolean
  /** 'apple_health' no iOS, 'health_connect' no Android. */
  provider: 'apple_health' | 'health_connect' | null
  /**
   * Por que não dá, quando não dá.
   *
   * `NEEDS_INSTALL` é específico do Android: o Health Connect é um app à parte
   * abaixo do Android 14, e a pessoa precisa instalá-lo. É a única razão que
   * tem conserto do lado de quem usa, e por isso tem código próprio.
   */
  reason?: 'UNSUPPORTED_PLATFORM' | 'NEEDS_INSTALL' | 'NO_HEALTH_DATA'
}

export interface HealthPermissionResult {
  granted: boolean
  /**
   * A plataforma **sabe** dizer se a leitura foi autorizada?
   *
   * O Health Connect sabe e devolve a lista do que foi concedido. O HealthKit
   * não: por projeto, ele não revela negativa de leitura, para que um app não
   * possa deduzir uma condição de saúde pelo que a pessoa escondeu. No iOS,
   * portanto, `granted: true` quer dizer "a folha foi apresentada", não "temos
   * acesso" — e a única forma de descobrir é consultar e ver se volta vazio.
   */
  authoritative: boolean
}

export interface SynseHealthPlugin {
  isAvailable(): Promise<HealthAvailability>
  requestPermissions(): Promise<HealthPermissionResult>
  /** Abre a tela de permissões do sistema, para quem negou e quer rever. */
  openSettings(): Promise<void>
  readSamples(options: {
    /** ISO 8601. */
    from: string
    /** ISO 8601. */
    to: string
    /** Teto de amostras; o nativo corta e devolve as mais recentes. */
    limit: number
  }): Promise<{ samples: HealthSample[] }>
}
