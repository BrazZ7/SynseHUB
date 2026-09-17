'use client'

import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar, Style } from '@capacitor/status-bar'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'

/**
 * O que o invólucro nativo precisa fazer e o site não faz sozinho.
 *
 * Montado no layout raiz porque vale para o app inteiro — o aluno e a academia
 * abrem o mesmo APK. No navegador tudo aqui é no-op: `isNativePlatform()` é
 * falso e nenhum plugin é tocado.
 */

/** Onde o botão voltar do Android encerra o app em vez de navegar. */
const RAIZES = ['/app', '/dashboard', '/login']

export function NativeShell() {
  const router = useRouter()
  const pathname = usePathname()
  /*
   * O caminho atual lido por referência, e não pela dependência do efeito.
   * Reassinar o listener a cada navegação abriria uma janela em que o botão
   * voltar não tem dono — e no Android isso fecha o app.
   */
  const caminho = useRef(pathname)
  caminho.current = pathname

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    /*
     * A splash espera a aplicação desenhar.
     *
     * `launchAutoHide: false` na configuração existe para isto: com
     * `server.url` o conteúdo vem da rede, e uma splash com tempo fixo
     * mostraria WebView em branco numa rede de academia. Quem sabe que a tela
     * está pronta é este componente, porque ele só monta depois da hidratação.
     */
    void SplashScreen.hide()

    // A aplicação é escura; ícones claros na barra de status.
    void StatusBar.setStyle({ style: Style.Dark }).catch(() => {})

    const listeners: { remove: () => void }[] = []

    /**
     * O botão voltar do Android.
     *
     * Sem tratamento, o Capacitor fecha o app ao primeiro toque — mesmo com o
     * aluno três telas adentro. Aqui ele anda para trás no histórico, e só
     * encerra quando já está numa raiz, que é o que o Android espera.
     */
    void CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack && !RAIZES.includes(caminho.current)) {
        router.back()
        return
      }
      void CapacitorApp.exitApp()
    }).then((h) => listeners.push(h))

    /**
     * Voltar do segundo plano revalida a tela.
     *
     * O app pode ficar horas em segundo plano com uma página renderizada no
     * servidor congelada na memória — check-ins de ontem, aula que já passou.
     * `router.refresh()` refaz a requisição sem perder o estado do cliente.
     */
    void CapacitorApp.addListener('resume', () => router.refresh()).then((h) => listeners.push(h))

    return () => listeners.forEach((l) => l.remove())
  }, [router])

  return null
}
