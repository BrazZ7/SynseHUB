'use client'

import type {
  LiveActivityPort,
  LiveWorkoutState,
  RemoteAction,
} from '@/features/active-workout/platform/types'

/**
 * A ponte para o plugin nativo, quando ele existir.
 *
 * O contrato está fechado aqui de propósito, antes de o invólucro nativo
 * existir: é ele que permite escrever o Swift e o Kotlin sem tocar em nada da
 * web, e é ele que a tela já usa hoje — caindo no adaptador web quando o
 * plugin não responde. Sem a ponte, ligar o nativo depois significaria mexer no
 * engine, que é justamente o que não se quer.
 *
 * O plugin vive em `native/synse-workout-activity` e é registrado pelo
 * Capacitor como `SynseWorkoutActivity`. A detecção é por presença: se o objeto
 * não estiver na janela, não há invólucro nativo rodando e o web assume.
 */

type PluginShape = {
  isSupported(): Promise<{ supported: boolean }>
  requestPermission(): Promise<{ granted: boolean }>
  start(options: LiveWorkoutState): Promise<void>
  update(options: LiveWorkoutState): Promise<void>
  restFinished(options: LiveWorkoutState): Promise<void>
  stop(): Promise<void>
  addListener(
    evento: 'remoteAction',
    handler: (dados: { action: RemoteAction }) => void,
  ): Promise<{ remove: () => void }>
}

type JanelaComCapacitor = Window & {
  Capacitor?: {
    getPlatform?: () => string
    isNativePlatform?: () => boolean
    Plugins?: Record<string, unknown>
  }
}

function plugin(): PluginShape | null {
  if (typeof window === 'undefined') return null
  const capacitor = (window as JanelaComCapacitor).Capacitor
  if (!capacitor?.isNativePlatform?.()) return null
  return (capacitor.Plugins?.SynseWorkoutActivity as PluginShape | undefined) ?? null
}

export function plataformaNativa(): 'ios' | 'android' | null {
  if (typeof window === 'undefined') return null
  const nome = (window as JanelaComCapacitor).Capacitor?.getPlatform?.()
  return nome === 'ios' || nome === 'android' ? nome : null
}

export class NativeLiveActivity implements LiveActivityPort {
  readonly kind: 'ios' | 'android'

  constructor(plataforma: 'ios' | 'android') {
    this.kind = plataforma
  }

  /*
   * Toda chamada é protegida. Plugin nativo que lança — versão antiga do app,
   * permissão revogada no meio do treino, Live Activity encerrada pelo sistema
   * — não pode derrubar a série de quem está com a barra na mão.
   */
  private async tentar<T>(operacao: (p: PluginShape) => Promise<T>, padrao: T): Promise<T> {
    const p = plugin()
    if (!p) return padrao
    try {
      return await operacao(p)
    } catch {
      return padrao
    }
  }

  async isSupported() {
    return (await this.tentar((p) => p.isSupported(), { supported: false })).supported
  }

  async requestPermission() {
    return (await this.tentar((p) => p.requestPermission(), { granted: false })).granted
  }

  async start(state: LiveWorkoutState) {
    await this.tentar((p) => p.start(state), undefined)
  }

  async update(state: LiveWorkoutState) {
    await this.tentar((p) => p.update(state), undefined)
  }

  async restFinished(state: LiveWorkoutState) {
    await this.tentar((p) => p.restFinished(state), undefined)
  }

  async stop() {
    await this.tentar((p) => p.stop(), undefined)
  }

  onRemoteAction(handler: (acao: RemoteAction) => void) {
    const p = plugin()
    if (!p) return () => {}

    let remover: (() => void) | null = null
    void p
      .addListener('remoteAction', (dados) => handler(dados.action))
      .then((assinatura) => {
        remover = assinatura.remove
      })
      .catch(() => {})

    return () => remover?.()
  }
}
