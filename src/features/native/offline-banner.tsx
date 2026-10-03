'use client'

import { WifiOff } from 'lucide-react'
import { useEffect, useState } from 'react'

/**
 * A faixa de "você está sem internet".
 *
 * A tela de `errorPath` só cobre o app que não conseguiu **abrir**. Com o app
 * já aberto e a rede caindo no meio — subsolo de academia, elevador, metrô —,
 * nada avisava: a navegação seguinte simplesmente falhava, e o produto parecia
 * quebrado em vez de desconectado.
 *
 * ── Por que só o `false` conta ───────────────────────────────────────────────
 *
 * `navigator.onLine` mente para cima: ele diz `true` para quem está num Wi-Fi
 * sem saída para a internet, que é metade dos casos reais. Mas quando diz
 * `false`, é verdade — o sistema operacional não tem interface de rede
 * nenhuma. Então a faixa aparece só nessa certeza. Fingir detectar o resto
 * daria um aviso que pisca sozinho, e aviso que mente é pior que aviso nenhum.
 */
export function OfflineBanner() {
  /*
   * Começa como "online" porque o servidor não tem `navigator` e porque essa é
   * a suposição certa: piscar a faixa em toda abertura de app seria ruído.
   */
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    const atualizar = () => setOffline(navigator.onLine === false)

    atualizar()
    window.addEventListener('online', atualizar)
    window.addEventListener('offline', atualizar)

    return () => {
      window.removeEventListener('online', atualizar)
      window.removeEventListener('offline', atualizar)
    }
  }, [])

  if (!offline) return null

  return (
    <div
      role="status"
      aria-live="polite"
      /*
       * Acima do conteúdo e abaixo de diálogo. `pt-[env(safe-area-inset-top)]`
       * porque no celular a faixa encosta no entalhe da câmera.
       */
      className="fixed inset-x-0 top-0 z-40 flex items-center justify-center gap-2 bg-synse-warning/90 px-4 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))] text-center text-xs font-medium text-[#04231f]"
    >
      <WifiOff className="size-3.5 shrink-0" aria-hidden />
      Sem internet. O que você registrar fica guardado e sobe sozinho.
    </div>
  )
}
