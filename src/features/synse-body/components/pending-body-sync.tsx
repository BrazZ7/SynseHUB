'use client'

import { AlertTriangle, CloudOff, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import { resumoDaFila, type ResumoDaFila } from '@/features/synse-body/state'
import { pendentes as lerPendentes } from '@/features/synse-body/storage/local-measurements'
import { sincronizarPendentes } from '@/features/synse-body/sync'
import { cn } from '@/lib/utils'

/**
 * Sobe as pesagens que ficaram no aparelho.
 *
 * A balança é Bluetooth, não é internet: pesar de manhã no banheiro, com o
 * celular sem sinal, é o caso comum. A medição acontece de qualquer jeito e
 * espera aqui.
 *
 * Existe porque a fila estava sendo escrita e nunca lida — a tela prometia
 * "sobe assim que houver rede" e ninguém subia. Promessa de sincronização sem
 * quem sincronize é pior que não prometer.
 *
 * Não desenha nada quando não há o que dizer: uma faixa "tudo sincronizado"
 * seria ruído permanente para informar o estado normal.
 */
export function PendingBodySync() {
  const router = useRouter()
  const [resumo, setResumo] = useState<ResumoDaFila>(null)
  /*
   * Guarda de reentrada. `online`, a volta do segundo plano e a montagem podem
   * disparar quase juntos — duas drenagens em paralelo mandariam a mesma
   * pesagem duas vezes. O `clientId` faria o banco absorver, mas é tráfego e
   * bateria gastos para nada.
   */
  const drenando = useRef(false)

  const drenar = useCallback(async () => {
    if (drenando.current) return

    const fila = await lerPendentes()
    if (!fila.length) {
      setResumo(null)
      return
    }

    /*
     * Sem rede nem tenta. A pessoa vê que há pesagem guardada, e o rádio não é
     * acordado para receber a mesma recusa.
     */
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setResumo(resumoDaFila({ pendentes: fila.length, enviando: false, descartadas: 0 }))
      return
    }

    drenando.current = true
    setResumo(resumoDaFila({ pendentes: fila.length, enviando: true, descartadas: 0 }))

    try {
      const resultado = await sincronizarPendentes()
      const restantes = await lerPendentes()

      setResumo(
        resumoDaFila({
          pendentes: restantes.length,
          enviando: false,
          descartadas: resultado.descartadas,
        }),
      )

      // Chegou medição nova: o histórico e o gráfico acima precisam refletir.
      if (resultado.enviadas > 0) router.refresh()
    } finally {
      drenando.current = false
    }
  }, [router])

  useEffect(() => {
    void drenar()

    /*
     * `visibilitychange` e não só `online`: no app, voltar do segundo plano
     * costuma ser o momento em que a rede existe de novo, e o evento `online`
     * pode ter acontecido com o app suspenso, sem ninguém para ouvir.
     */
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') void drenar()
    }
    /*
     * Nomeado, e não uma arrow escrita duas vezes: `removeEventListener` compara
     * por identidade, então uma arrow nova na limpeza não remove nada — o
     * ouvinte fica pendurado a cada navegação.
     */
    const aoConectar = () => void drenar()

    window.addEventListener('online', aoConectar)
    document.addEventListener('visibilitychange', aoVoltar)

    return () => {
      window.removeEventListener('online', aoConectar)
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [drenar])

  if (!resumo) return null

  const Icone = resumo.tom === 'alerta' ? AlertTriangle : CloudOff

  return (
    <p
      role="status"
      className={cn(
        'flex items-start gap-2 rounded-xl border px-4 py-3 text-sm',
        resumo.tom === 'alerta'
          ? 'border-synse-warning/40 bg-synse-warning/5 text-synse-text'
          : 'border-synse-border bg-synse-surface text-synse-muted',
      )}
    >
      {resumo.texto.startsWith('Enviando') ? (
        <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" aria-hidden />
      ) : (
        <Icone className="mt-0.5 size-4 shrink-0" aria-hidden />
      )}
      {resumo.texto}
    </p>
  )
}
