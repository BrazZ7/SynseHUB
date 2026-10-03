'use client'

import { Check, Globe, Loader2, Lock, Trash2, Users } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { ConfirmDialog } from '@/components/synse/confirm-dialog'
import { Feedback } from '@/components/synse/form-field'
import { Button } from '@/components/ui/button'
import { deleteActivityAction, updateActivityPrivacyAction } from '@/features/synse-run/actions'
import { cn } from '@/lib/utils'
import type { ActivityPrivacy } from '@/types/domain'

/**
 * ── Quem vê esta corrida ────────────────────────────────────────────────────
 *
 * `updateActivityPrivacyAction` existe desde o Synse Run e nenhuma tela a
 * chamava: a atividade nascia com a privacidade padrão e **não havia como
 * mudar**. A tela só mostrava o selo — "Público", "Visível para a academia" —
 * como um fato dado.
 *
 * O que está em jogo não é a distância: é o **percurso**. O traçado de uma
 * corrida que começa e termina no mesmo ponto diz onde a pessoa mora, e a que
 * horas ela não está em casa. Isso ser público por padrão, sem botão para
 * mudar, é o pior dos dois mundos.
 *
 * ── Três botões, e não um interruptor ───────────────────────────────────────
 *
 * São três estados e eles não estão numa linha: "a academia vê" não é meio
 * caminho entre público e privado — é outra audiência. Um interruptor
 * esconderia o do meio, que é justamente o que a maioria quer.
 */
const OPCOES: { valor: ActivityPrivacy; rotulo: string; icone: typeof Globe; frase: string }[] = [
  { valor: 'PUBLIC', rotulo: 'Público', icone: Globe, frase: 'Qualquer pessoa no Synse.' },
  { valor: 'GYM', rotulo: 'Minha academia', icone: Users, frase: 'Quem treina com você.' },
  { valor: 'PRIVATE', rotulo: 'Só eu', icone: Lock, frase: 'Fora de rankings e do mural.' },
]

export function PrivacidadeDaCorrida({
  activityId,
  privacidade,
}: {
  activityId: string
  privacidade: ActivityPrivacy
}) {
  const router = useRouter()
  const [atual, setAtual] = useState(privacidade)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  function mudar(valor: ActivityPrivacy) {
    if (valor === atual) return
    const anterior = atual

    /*
     * Mostra a escolha na hora e **desfaz se o servidor recusar**.
     *
     * A action devolvia `void` e engolia a exceção, então a tela não tinha
     * como saber. Agora tem — e sem este `setAtual(anterior)` o otimismo
     * viraria a mentira que o `void` já contava: o botão ficaria marcado em
     * "Só eu" com a corrida ainda pública.
     */
    setAtual(valor)
    iniciar(async () => {
      const resultado = await updateActivityPrivacyAction(activityId, valor)
      if (resultado.status === 'error') {
        setAtual(anterior)
        setErro(resultado.message)
        return
      }
      setErro(null)
      router.refresh()
    })
  }

  async function apagar() {
    const resultado = await deleteActivityAction(activityId)
    if (resultado.status === 'error') {
      setErro(resultado.message)
      return
    }
    router.push('/app/run/history')
    router.refresh()
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-synse-text">Quem vê esta corrida</h2>
        <p className="text-xs text-synse-muted">
          O percurso mostra por onde você passou. Vale escolher.
        </p>
      </div>

      {erro && <Feedback tone="error" message={erro} />}

      <div className="grid gap-2 sm:grid-cols-3">
        {OPCOES.map(({ valor, rotulo, icone: Icone, frase }) => (
          <button
            key={valor}
            type="button"
            onClick={() => mudar(valor)}
            disabled={pendente}
            aria-pressed={atual === valor}
            className={cn(
              'rounded-xl border p-3 text-left transition-colors disabled:opacity-60',
              atual === valor
                ? 'border-synse-primary bg-synse-primary/10'
                : 'border-synse-border bg-synse-surface hover:border-synse-primary/40',
            )}
          >
            <span className="flex items-center gap-1.5">
              <Icone className="size-4 text-synse-primary" aria-hidden />
              {atual === valor &&
                (pendente ? (
                  <Loader2 className="size-3 animate-spin text-synse-primary" aria-hidden />
                ) : (
                  <Check className="size-3 text-synse-primary" aria-hidden />
                ))}
            </span>
            <span className="mt-1.5 block text-sm font-medium text-synse-text">{rotulo}</span>
            <span className="mt-0.5 block text-xs text-synse-muted">{frase}</span>
          </button>
        ))}
      </div>

      <ConfirmDialog
        trigger={
          <Button variant="ghost" size="sm" className="text-synse-muted">
            <Trash2 className="size-4" aria-hidden />
            Apagar esta corrida
          </Button>
        }
        title="Apagar esta corrida?"
        description="O percurso, o tempo e os números somem do seu histórico e dos rankings. Não há como desfazer."
        confirmLabel="Apagar"
        destructive
        onConfirm={apagar}
      />
    </section>
  )
}
