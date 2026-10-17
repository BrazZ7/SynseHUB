'use client'

import { Copy, UserPlus } from 'lucide-react'
import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'

import { Field, Feedback, SELECT_CLASS } from '@/components/synse/form-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { inviteStaffAction } from '@/features/staff/actions'
import { initialStaffState } from '@/features/staff/state'
import { ROLE_LABELS } from '@/lib/permissions/permissions'
import { CONVIDAVEIS } from '@/lib/validations/staff'

/**
 * Convidar alguém para a equipe.
 *
 * O link aparece na tela mesmo quando o e-mail sai. Não é desconfiança do
 * envio: é que caixa de spam e endereço digitado errado são a regra, e a
 * academia resolve isso pelo WhatsApp em quinze segundos.
 */
export function InviteStaffCard() {
  const [state, formAction] = useActionState(inviteStaffAction, initialStaffState)
  const [copiado, setCopiado] = useState(false)

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.status === 'success' && (
        <Feedback tone="success" message={state.message ?? ''}>
          {state.link && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-synse-surface-2 px-2.5 py-1.5 text-xs text-synse-text">
                {state.link}
              </code>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard?.writeText(state.link!).then(() => setCopiado(true))
                }}
              >
                <Copy className="size-3.5" aria-hidden />
                {copiado ? 'Copiado' : 'Copiar'}
              </Button>
            </div>
          )}
        </Feedback>
      )}
      {state.status === 'error' && <Feedback tone="error" message={state.message ?? ''} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          id="email"
          label="E-mail"
          hint="Quem aceitar precisa entrar com este endereço."
          errors={state.fieldErrors?.email}
          input={
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="off"
              placeholder="professor@academia.com.br"
            />
          }
        />

        <Field
          id="role"
          label="Função"
          errors={state.fieldErrors?.role}
          input={
            <select id="role" name="role" defaultValue="TRAINER" className={SELECT_CLASS}>
              {CONVIDAVEIS.map((papel) => (
                <option key={papel} value={papel}>
                  {ROLE_LABELS[papel]}
                </option>
              ))}
            </select>
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          id="jobTitle"
          label="Cargo"
          hint="Como aparece na equipe. Opcional."
          errors={state.fieldErrors?.jobTitle}
          input={<Input id="jobTitle" name="jobTitle" placeholder="Coordenador de musculação" />}
        />
        <Field
          id="registrationNumber"
          label="Registro profissional"
          hint="CREF, CRN. Opcional."
          errors={state.fieldErrors?.registrationNumber}
          input={
            <Input id="registrationNumber" name="registrationNumber" placeholder="CREF 000000-G/SP" />
          }
        />
      </div>

      <SubmitButton />
    </form>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      <UserPlus className="size-4" aria-hidden />
      {pending ? 'Enviando…' : 'Enviar convite'}
    </Button>
  )
}
