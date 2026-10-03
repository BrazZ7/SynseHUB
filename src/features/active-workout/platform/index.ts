'use client'

import { NativeLiveActivity, plataformaNativa } from '@/features/active-workout/platform/native-bridge'
import { WebFeedback, WebLiveActivity } from '@/features/active-workout/platform/web-adapter'
import type { FeedbackPort, LiveActivityPort } from '@/features/active-workout/platform/types'

/**
 * Escolhe o backend da tela bloqueada.
 *
 * Nativo quando há invólucro; web caso contrário. A escolha é por presença do
 * plugin, não por user agent: sniffar user agent erra com PWA instalada,
 * webview embutida e navegador no desktop, e o erro só aparece no aparelho de
 * alguém.
 */
export function criarLiveActivity(): LiveActivityPort {
  const nativa = plataformaNativa()
  return nativa ? new NativeLiveActivity(nativa) : new WebLiveActivity()
}

export function criarFeedback(): FeedbackPort {
  return new WebFeedback()
}

export type { FeedbackPort, LiveActivityPort, LiveWorkoutState, RemoteAction } from '@/features/active-workout/platform/types'
