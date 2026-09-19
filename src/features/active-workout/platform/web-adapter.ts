'use client'

import type {
  FeedbackPort,
  LiveActivityPort,
  LiveWorkoutState,
  RemoteAction,
} from '@/features/active-workout/platform/types'

/**
 * O que a web entrega hoje, sem mentir sobre o que ela não entrega.
 *
 * **Entrega de verdade:** aviso do sistema quando o descanso acaba (Android e
 * PWA instalada no iOS 16.4+), vibração no Android, e Wake Lock para a tela não
 * apagar no meio da série.
 *
 * **Não entrega:** cronômetro correndo na tela bloqueada, nem botão de concluir
 * série de lá. Isso exige ActivityKit no iOS e um foreground service no
 * Android — está em `native-bridge.ts`, e depende do invólucro nativo que o
 * projeto ainda não tem.
 *
 * O aviso é agendado por `setTimeout` com o alvo em `restEndsAt`. Navegador em
 * segundo plano estrangula temporizador, então o disparo pode atrasar alguns
 * segundos — e é por isso que a tela recalcula pelo instante gravado quando
 * volta, em vez de confiar no aviso ter chegado na hora. O aviso é o empurrão;
 * a verdade é o `restEndsAt`.
 */

const TAG = 'synse-descanso'

export class WebLiveActivity implements LiveActivityPort {
  readonly kind = 'web' as const
  private timer: ReturnType<typeof setTimeout> | null = null
  private handlers = new Set<(acao: RemoteAction) => void>()

  async isSupported() {
    return typeof window !== 'undefined' && 'Notification' in window
  }

  async requestPermission() {
    if (!(await this.isSupported())) return false
    if (Notification.permission === 'granted') return true
    if (Notification.permission === 'denied') return false
    try {
      return (await Notification.requestPermission()) === 'granted'
    } catch {
      return false
    }
  }

  async start(state: LiveWorkoutState) {
    await this.update(state)
  }

  async update(state: LiveWorkoutState) {
    this.cancelar()
    if (state.phase !== 'REST' || !state.restEndsAt) return

    const faltam = state.restEndsAt - Date.now()
    if (faltam <= 0) {
      await this.restFinished(state)
      return
    }
    this.timer = setTimeout(() => void this.restFinished(state), faltam)
  }

  async restFinished(state: LiveWorkoutState) {
    this.cancelar()
    if (Notification.permission !== 'granted') return

    try {
      /*
       * `tag` fixa: o aviso do descanso anterior é substituído em vez de
       * empilhar. Quem faz quatro séries não quer quatro avisos na gaveta.
       */
      const aviso = new Notification('Descanso concluído', {
        body: `${state.exerciseName} — série ${state.setNumber} de ${state.totalSets} pronta.`,
        tag: TAG,
        silent: false,
        // Android respeita: o aviso fica até a pessoa ver.
        requireInteraction: true,
      })
      aviso.onclick = () => {
        window.focus()
        aviso.close()
        for (const handler of this.handlers) handler('NEXT_SET')
      }
    } catch {
      // Aviso negado ou indisponível: a tela ainda mostra o fim do descanso.
    }
  }

  async stop() {
    this.cancelar()
  }

  onRemoteAction(handler: (acao: RemoteAction) => void) {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  private cancelar() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }
}

/** Vibração e Wake Lock. Ambos degradam em silêncio onde não existem. */
export class WebFeedback implements FeedbackPort {
  private sentinel: WakeLockSentinel | null = null

  vibrate(padrao: number[]) {
    // iOS Safari não implementa. Sem `catch` explícito porque a chamada não
    // lança — ela simplesmente não existe, e o `?.` resolve.
    try {
      navigator.vibrate?.(padrao)
    } catch {
      /* nada a fazer */
    }
  }

  async keepAwake(ativo: boolean) {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return

    if (!ativo) {
      await this.sentinel?.release().catch(() => {})
      this.sentinel = null
      return
    }

    try {
      this.sentinel = await navigator.wakeLock.request('screen')
      /*
       * O sistema solta o Wake Lock sozinho quando a aba perde o foco, e não o
       * devolve na volta. Sem este religar, a tela começa a apagar no meio do
       * treino depois da primeira troca de app.
       */
      this.sentinel.addEventListener('release', () => {
        this.sentinel = null
      })
    } catch {
      // Negado, sem bateria, ou aba em segundo plano. Segue sem.
    }
  }
}
