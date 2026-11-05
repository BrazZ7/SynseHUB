'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { Feedback } from '@/components/synse/form-field'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { revokeStaffInviteAction } from '@/features/staff/actions'
import { initialStaffState } from '@/features/staff/state'
import { ROLE_LABELS } from '@/lib/permissions/permissions'
import { formatDate } from '@/lib/utils'
import type { StaffInvite } from '@/types/domain'

/** Convites que ainda não viraram gente. */
export function PendingInvites({ invites }: { invites: StaffInvite[] }) {
  const [state, formAction] = useActionState(revokeStaffInviteAction, initialStaffState)

  const pendentes = invites.filter((convite) => convite.status === 'PENDING')
  if (pendentes.length === 0) return null

  return (
    <section className="rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm">
      <h2 className="mb-1 text-sm font-semibold text-synse-text">Convites pendentes</h2>
      <p className="mb-3 text-xs text-synse-muted">
        Só passam a contar como equipe depois que a pessoa aceitar entrando com o e-mail convidado.
      </p>

      {state.status === 'success' && <Feedback tone="success" message={state.message ?? ''} />}
      {state.status === 'error' && <Feedback tone="error" message={state.message ?? ''} />}

      <ul className="divide-y divide-synse-border">
        {pendentes.map((convite) => {
          const vencido = new Date(convite.expiresAt) < new Date()

          return (
            <li key={convite.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-synse-text">{convite.email}</p>
                <p className="text-xs text-synse-muted">
                  {vencido
                    ? `Venceu em ${formatDate(convite.expiresAt)} — convide de novo para gerar um link novo.`
                    : `Vale até ${formatDate(convite.expiresAt)}`}
                </p>
              </div>

              <Badge variant={vencido ? 'outline' : 'primary'}>{ROLE_LABELS[convite.role]}</Badge>

              <form action={formAction}>
                <input type="hidden" name="inviteId" value={convite.id} />
                <CancelButton />
              </form>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function CancelButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" variant="ghost" disabled={pending}>
      {pending ? '…' : 'Cancelar'}
    </Button>
  )
}
