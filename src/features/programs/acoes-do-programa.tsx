'use client'

import { Loader2 } from 'lucide-react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { Feedback } from '@/components/synse/form-field'
import { Button } from '@/components/ui/button'
import { abandonarProgramaAction, iniciarProgramaAction } from '@/features/programs/actions'
import { programaInicial } from '@/features/programs/state'

/** Começar, ou recomeçar. Recomeçar zera o progresso — a 0043 avisa e faz. */
export function IniciarPrograma({ programId, rotulo }: { programId: string; rotulo: string }) {
  const [state, formAction] = useActionState(iniciarProgramaAction, programaInicial)

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="programId" value={programId} />
      {state.status === 'error' && <Feedback tone="error" message={state.message ?? ''} />}
      <Enviar variant="gradient" size="lg" className="w-full" rotulo={rotulo} />
    </form>
  )
}

export function AbandonarPrograma({ programId }: { programId: string }) {
  const [state, formAction] = useActionState(abandonarProgramaAction, programaInicial)

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="programId" value={programId} />
      {state.status === 'error' && <Feedback tone="error" message={state.message ?? ''} />}
      {/*
       * Sem confirmação, de propósito: sair guarda o que já foi feito
       * (`status = 'ABANDONED'`, a 0043 não apaga os dias) e recomeçar está a
       * um toque. Diálogo de confirmação é para o que não se desfaz.
       */}
      <Enviar variant="ghost" size="sm" className="w-full" rotulo="Sair do programa" />
    </form>
  )
}

function Enviar({ rotulo, ...resto }: { rotulo: string } & React.ComponentProps<typeof Button>) {
  const { pending } = useFormStatus()

  return (
    <Button {...resto} disabled={pending}>
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {rotulo}
    </Button>
  )
}
