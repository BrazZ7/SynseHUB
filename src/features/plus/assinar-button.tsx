'use client'

import { Loader2 } from 'lucide-react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { Feedback } from '@/components/synse/form-field'
import { Button } from '@/components/ui/button'
import { assinarPlusAction } from '@/features/plus/actions'
import { adesaoInicial } from '@/features/plus/state'

/**
 * O botão que estava desativado desde que a tela existe.
 *
 * Ele leva ao checkout do provedor, e nada mais: o Synse+ só liga quando o
 * webhook confirma. Quem volta do checkout sem ter autorizado o débito
 * continua no plano grátis, e é assim que tem que ser — a tela não pode
 * conceder acesso com base em "a pessoa voltou da página de pagamento".
 */
export function AssinarPlusButton({ indisponivel }: { indisponivel?: boolean }) {
  const [state, formAction] = useActionState(assinarPlusAction, adesaoInicial)

  if (indisponivel) {
    return (
      <>
        <Button variant="gradient" size="lg" className="mt-4 w-full" disabled>
          Começar o mês grátis
        </Button>
        {/*
          Desativado **e** com o motivo escrito. Botão cinza sem explicação faz
          a pessoa tentar de novo e concluir que o app está quebrado.
        */}
        <p className="mt-2 text-xs text-synse-muted">
          A assinatura ainda não está disponível. Nenhuma cobrança é feita.
        </p>
      </>
    )
  }

  return (
    <form action={formAction} className="mt-4">
      {state.status === 'error' && <Feedback tone="error" message={state.message ?? ''} />}
      <Submit />
    </form>
  )
}

function Submit() {
  const { pending } = useFormStatus()

  return (
    <Button variant="gradient" size="lg" className="w-full" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Abrindo o pagamento…
        </>
      ) : (
        'Começar o mês grátis'
      )}
    </Button>
  )
}
