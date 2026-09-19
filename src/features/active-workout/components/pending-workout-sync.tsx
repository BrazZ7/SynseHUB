'use client'

import { AlertTriangle, CloudOff, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

import { resumoDoTreino, type ResumoDoTreino } from '@/features/active-workout/state'
import { lerFila } from '@/features/active-workout/storage/local-workout'
import { sincronizar } from '@/features/active-workout/sync'
import { cn } from '@/lib/utils'

/**
 * Sobe o treino que ficou no aparelho.
 *
 * Existe por causa de um buraco entre duas decisões que, cada uma sozinha,
 * fazia sentido: a recuperação **não** restaura um treino já concluído — e ela
 * está certa, porque reabrir a tela de um treino terminado seria pior —, e a
 * drenagem da fila vivia dentro do `useActiveWorkout`, atrás de um
 * `if (!sessao) return`.
 *
 * Juntas, produziam isto: treinar no subsolo da academia, encerrar, fechar o
 * app. Na volta, a sessão não é restaurada, não há `sessao`, ninguém drena — e
 * o treino inteiro, com todas as séries e cargas, nunca chega ao servidor.
 *
 * Aqui a drenagem não depende de haver treino aberto. Fica na lista de treinos
 * porque é para onde a pessoa volta, e não na tela do treino ativo, onde o
 * `useActiveWorkout` já cuida da fila enquanto a sessão existe.
 */
export function PendingWorkoutSync() {
  const router = useRouter()
  const [resumo, setResumo] = useState<ResumoDoTreino>(null)
  const [enviando, setEnviando] = useState(false)
  /*
   * Guarda de reentrada: montagem, `online` e a volta do segundo plano podem
   * disparar quase juntos, e duas passagens em paralelo mandariam a mesma
   * operação duas vezes. O `clientId` faria o banco absorver, mas é rede e
   * bateria gastas à toa.
   */
  const drenando = useRef(false)

  const drenar = useCallback(async () => {
    if (drenando.current) return

    const fila = await lerFila()
    if (!fila.length) {
      setResumo(null)
      return
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setResumo(resumoDoTreino({ pendentes: fila.length, treinosPerdidos: 0, seriesPerdidas: 0 }))
      return
    }

    drenando.current = true
    setEnviando(true)
    try {
      /*
       * `null` como sessão conhecida: esta tela não tem treino aberto, e o id
       * do servidor sai da própria fila quando o START sobe.
       */
      const resultado = await sincronizar(null)

      setResumo(
        resumoDoTreino({
          pendentes: resultado.pendentes,
          treinosPerdidos: resultado.treinosPerdidos,
          seriesPerdidas: resultado.seriesPerdidas,
        }),
      )

      // Chegou treino novo: a lista acima precisa refletir.
      if (resultado.enviadas > 0) router.refresh()
    } finally {
      drenando.current = false
      setEnviando(false)
    }
  }, [router])

  useEffect(() => {
    void drenar()

    const aoConectar = () => void drenar()
    /*
     * `visibilitychange` além do `online`: no aplicativo, voltar do segundo
     * plano é o momento em que a rede costuma existir de novo, e o `online`
     * pode ter acontecido com o processo suspenso, sem ninguém para ouvir.
     */
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') void drenar()
    }

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
      {enviando ? (
        <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" aria-hidden />
      ) : (
        <Icone className="mt-0.5 size-4 shrink-0" aria-hidden />
      )}
      {enviando ? 'Enviando o treino que ficou no aparelho…' : resumo.texto}
    </p>
  )
}
