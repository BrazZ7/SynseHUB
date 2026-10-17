import type { RawPoint } from '@/features/synse-run/engine/types'

/**
 * Simulador de GPS.
 *
 * Os casos que quebram um app de corrida — pessoa parada no semáforo, sinal
 * saltando entre prédios, precisão despencando num túnel — não aparecem
 * clicando na tela: exigiriam sair correndo com o celular na mão a cada
 * alteração de código. Aqui eles são reproduzíveis e determinísticos.
 */

const METRO_EM_GRAU = 1 / 111_195

export type SimOptions = {
  /** Ponto de partida. Padrão: avenida Paulista. */
  origem?: { latitude: number; longitude: number }
  /** Instante inicial em epoch ms. */
  inicio?: number
  /** Intervalo entre pontos, em segundos. */
  intervalo?: number
  accuracy?: number
  altitude?: number
}

export class GpsSimulator {
  private latitude: number
  private longitude: number
  private tempo: number
  private readonly intervalo: number
  private accuracy: number
  private altitude: number

  constructor(opcoes: SimOptions = {}) {
    this.latitude = opcoes.origem?.latitude ?? -23.5613
    this.longitude = opcoes.origem?.longitude ?? -46.6565
    this.tempo = opcoes.inicio ?? 1_700_000_000_000
    this.intervalo = opcoes.intervalo ?? 1
    this.accuracy = opcoes.accuracy ?? 5
    this.altitude = opcoes.altitude ?? 750
  }

  private emitir(): RawPoint {
    return {
      latitude: this.latitude,
      longitude: this.longitude,
      altitude: this.altitude,
      accuracy: this.accuracy,
      speed: null,
      heading: null,
      timestamp: this.tempo,
    }
  }

  /** Corre em linha reta para o norte, na velocidade dada, por N segundos. */
  correr(metrosPorSegundo: number, segundos: number): RawPoint[] {
    const pontos: RawPoint[] = []
    for (let t = 0; t < segundos; t += this.intervalo) {
      this.latitude += metrosPorSegundo * this.intervalo * METRO_EM_GRAU
      this.tempo += this.intervalo * 1000
      pontos.push(this.emitir())
    }
    return pontos
  }

  /** Fica parado, com a posição oscilando dentro do erro do aparelho. */
  parar(segundos: number, oscilacaoMetros = 4): RawPoint[] {
    const pontos: RawPoint[] = []
    const base = { latitude: this.latitude, longitude: this.longitude }

    for (let t = 0; t < segundos; t += this.intervalo) {
      // Oscilação determinística: alterna em torno da posição real, como o
      // GPS faz parado, sem depender de aleatoriedade num teste.
      const fase = (t / this.intervalo) % 4
      const desvio = [0, 1, 0, -1][fase] * oscilacaoMetros * METRO_EM_GRAU
      this.latitude = base.latitude + desvio
      this.tempo += this.intervalo * 1000
      pontos.push(this.emitir())
    }

    this.latitude = base.latitude
    this.longitude = base.longitude
    return pontos
  }

  /** Um salto absurdo, como o GPS faz ao sair de um túnel. */
  saltar(metros: number): RawPoint {
    this.latitude += metros * METRO_EM_GRAU
    this.tempo += this.intervalo * 1000
    return this.emitir()
  }

  /** Piora ou melhora a precisão informada pelo aparelho. */
  comPrecisao(metros: number): this {
    this.accuracy = metros
    return this
  }

  /** Sobe ou desce, em metros, mantendo a posição horizontal. */
  variarAltitude(metros: number): this {
    this.altitude += metros
    return this
  }

  /** Avança o relógio sem emitir ponto — sinal perdido. */
  perderSinal(segundos: number): this {
    this.tempo += segundos * 1000
    return this
  }

  get agora(): number {
    return this.tempo
  }
}
