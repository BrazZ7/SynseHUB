'use client'

import { Globe, Loader2, Sparkles } from 'lucide-react'
import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'

import { Field, Feedback } from '@/components/synse/form-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { salvarProgramaAction } from '@/features/programs/admin-actions'
import { programAdminInicial } from '@/features/programs/admin-state'
import { cn } from '@/lib/utils'
import type { Program } from '@/types/domain'

/**
 * O formulário do programa.
 *
 * A visibilidade é escolha, e em dois cartões, como no acervo: errar para o
 * lado de trancar se desfaz num clique, e errar para o lado de abrir não
 * desfaz quem já baixou. O padrão é o Synse+.
 */
const OPCOES = [
  {
    valor: 'SYNSE_PLUS' as const,
    rotulo: 'Só assinantes',
    icone: Sparkles,
    frase: 'Quem tem Synse+ vigente.',
  },
  { valor: 'FREE' as const, rotulo: 'Aberto a todos', icone: Globe, frase: 'Qualquer conta.' },
]

export function ProgramForm({ programa }: { programa?: Program }) {
  const [state, formAction] = useActionState(salvarProgramaAction, programAdminInicial)
  const [visibilidade, setVisibilidade] = useState<'FREE' | 'SYNSE_PLUS'>(
    programa?.visibility === 'FREE' ? 'FREE' : 'SYNSE_PLUS',
  )

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {programa && <input type="hidden" name="programId" value={programa.id} />}
      <input type="hidden" name="visibility" value={visibilidade} />

      {state.status === 'success' && <Feedback tone="success" message={state.message ?? ''} />}
      {state.status === 'error' && <Feedback tone="error" message={state.message ?? ''} />}

      <div className="grid gap-3 sm:grid-cols-2">
        {OPCOES.map(({ valor, rotulo, icone: Icone, frase }) => (
          <button
            key={valor}
            type="button"
            onClick={() => setVisibilidade(valor)}
            aria-pressed={visibilidade === valor}
            className={cn(
              'rounded-xl border p-4 text-left transition-colors',
              visibilidade === valor
                ? 'border-synse-primary bg-synse-primary/10'
                : 'border-synse-border bg-synse-surface hover:border-synse-primary/40',
            )}
          >
            <Icone className="size-4 text-synse-primary" aria-hidden />
            <p className="mt-2 text-sm font-medium text-synse-text">{rotulo}</p>
            <p className="mt-0.5 text-xs text-synse-muted">{frase}</p>
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="code"
          label="Código"
          hint="Chave estável, única. Ex.: SYNSE_21"
          errors={state.fieldErrors?.code}
          input={
            <Input
              id="code"
              name="code"
              maxLength={40}
              defaultValue={programa?.code ?? ''}
              placeholder="SYNSE_21"
            />
          }
        />
        <Field
          id="durationDays"
          label="Duração (dias)"
          errors={state.fieldErrors?.durationDays}
          input={
            <Input
              id="durationDays"
              name="durationDays"
              type="number"
              min={1}
              max={365}
              defaultValue={programa?.durationDays ?? 21}
            />
          }
        />
      </div>

      <Field
        id="title"
        label="Título"
        errors={state.fieldErrors?.title}
        input={
          <Input id="title" name="title" maxLength={140} defaultValue={programa?.title ?? ''} />
        }
      />

      <Field
        id="description"
        label="Descrição"
        errors={state.fieldErrors?.description}
        input={
          <Textarea
            id="description"
            name="description"
            rows={3}
            maxLength={600}
            defaultValue={programa?.description ?? ''}
          />
        }
      />

      <Field
        id="coverUrl"
        label="Imagem de capa"
        errors={state.fieldErrors?.coverUrl}
        input={
          <Input
            id="coverUrl"
            name="coverUrl"
            type="url"
            defaultValue={programa?.coverUrl ?? ''}
            placeholder="https://"
          />
        }
      />

      <Enviar rotulo={programa ? 'Salvar alterações' : 'Criar programa'} />
    </form>
  )
}

function Enviar({ rotulo }: { rotulo: string }) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {rotulo}
    </Button>
  )
}
