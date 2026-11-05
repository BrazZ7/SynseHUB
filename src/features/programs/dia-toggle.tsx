'use client'

import { Check, Loader2 } from 'lucide-react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { marcarDiaAction } from '@/features/programs/actions'
import { programaInicial } from '@/features/programs/state'
import { cn } from '@/lib/utils'

/**
 * O botão de marcar o dia.
 *
 * Um formulário por dia, e não um estado de cliente guardando a lista: quem
 * decide o que ficou marcado é o banco, e recarregar a página tem que mostrar
 * a verdade. Otimismo local aqui daria a sensação de progresso que uma recusa
 * da 0043 — assinatura vencida no meio do programa — desmentiria no refresh.
 */
export function DiaToggle({
  programId,
  dia,
  feito,
}: {
  programId: string
  dia: number
  feito: boolean
}) {
  const [state, formAction] = useActionState(marcarDiaAction, programaInicial)

  return (
    <form action={formAction}>
      <input type="hidden" name="programId" value={programId} />
      <input type="hidden" name="dia" value={dia} />
      <input type="hidden" name="desfazer" value={feito ? '1' : '0'} />
      <Botao feito={feito} dia={dia} erro={state.status === 'error' ? state.message : undefined} />
    </form>
  )
}

function Botao({ feito, dia, erro }: { feito: boolean; dia: number; erro?: string }) {
  const { pending } = useFormStatus()

  return (
    <>
      <button
        type="submit"
        disabled={pending}
        aria-pressed={feito}
        aria-label={feito ? `Desmarcar o dia ${dia}` : `Marcar o dia ${dia} como feito`}
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-full border transition-colors',
          feito
            ? 'border-synse-primary bg-synse-primary text-white'
            : 'border-synse-border text-synse-muted hover:border-synse-primary/40',
          pending && 'opacity-60',
        )}
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Check className="size-4" aria-hidden />
        )}
      </button>
      {/* A recusa aparece ao lado do dia, não num aviso no topo que ninguém
          liga ao toque que acabou de dar. */}
      {erro && (
        <p className="mt-1 max-w-[7rem] text-[10px] leading-tight text-synse-danger">{erro}</p>
      )}
    </>
  )
}
