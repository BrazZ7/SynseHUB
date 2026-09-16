'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Clock, MapPin, UserRound } from 'lucide-react'

import { Feedback } from '@/components/synse/form-field'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { bookClassAction, cancelBookingAction } from '@/features/schedule/actions'
import { initialScheduleState } from '@/features/schedule/state'
import { horaLocal, ocupacao } from '@/features/schedule/week'
import { cn } from '@/lib/utils'
import type { ClassSessionForStudent } from '@/types/domain'

/**
 * A agenda do aluno.
 *
 * Cada aula é um cartão com um botão só: reservar, ou desmarcar. A decisão de
 * vaga ou fila é do banco — a tela nunca promete "tem vaga" a partir de uma
 * contagem que pode estar velha na mão de quem abriu antes.
 */
export function StudentSchedule({ dias }: { dias: Array<{ rotulo: string; aulas: ClassSessionForStudent[] }> }) {
  return (
    <div className="space-y-5">
      {dias.map((dia) => (
        <section key={dia.rotulo} className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-synse-muted">
            {dia.rotulo}
          </h2>
          {dia.aulas.map((aula) => (
            <CartaoDeAula key={aula.id} aula={aula} />
          ))}
        </section>
      ))}
    </div>
  )
}

function CartaoDeAula({ aula }: { aula: ClassSessionForStudent }) {
  const lotacao = ocupacao(aula)
  const cancelada = aula.status === 'CANCELLED'
  const reservado = aula.myBookingStatus === 'BOOKED' || aula.myBookingStatus === 'ATTENDED'
  const esperando = aula.myBookingStatus === 'WAITLIST'

  return (
    <article
      className={cn(
        'rounded-xl border p-3.5',
        cancelada && 'border-synse-border bg-synse-surface-2 opacity-70',
        !cancelada && reservado && 'border-synse-primary/40 bg-synse-primary/5',
        !cancelada && !reservado && 'border-synse-border bg-synse-surface',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn('font-medium text-synse-text', cancelada && 'line-through')}>
            {aula.name}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-synse-muted">
            <span className="flex items-center gap-1">
              <Clock className="size-3.5" aria-hidden />
              {horaLocal(aula.startsAt)}
            </span>
            {aula.staffName && (
              <span className="flex items-center gap-1">
                <UserRound className="size-3.5" aria-hidden />
                {aula.staffName}
              </span>
            )}
            {aula.room && (
              <span className="flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden />
                {aula.room}
              </span>
            )}
          </p>
        </div>

        {cancelada ? (
          <Badge variant="danger">Cancelada</Badge>
        ) : reservado ? (
          <Badge variant="success">Confirmado</Badge>
        ) : esperando ? (
          <Badge variant="warning">{aula.waitlistPosition}º na espera</Badge>
        ) : (
          <Badge variant={lotacao.lotada ? 'warning' : 'primary'}>
            {lotacao.lotada ? 'Cheia' : `${lotacao.vagas} vagas`}
          </Badge>
        )}
      </div>

      {cancelada ? (
        aula.cancellationReason && (
          <p className="mt-2 text-xs text-synse-muted">{aula.cancellationReason}</p>
        )
      ) : (
        <div className="mt-3">
          {aula.myBookingId ? (
            <Desmarcar bookingId={aula.myBookingId} esperando={esperando} />
          ) : (
            <Reservar sessionId={aula.id} lotada={lotacao.lotada} />
          )}
        </div>
      )}
    </article>
  )
}

function Reservar({ sessionId, lotada }: { sessionId: string; lotada: boolean }) {
  const [state, formAction] = useActionState(bookClassAction, initialScheduleState)

  return (
    <form action={formAction}>
      <input type="hidden" name="sessionId" value={sessionId} />
      {state.status !== 'idle' && (
        <div className="mb-2">
          <Feedback
            tone={state.status === 'success' ? 'success' : 'error'}
            message={state.message ?? ''}
          />
        </div>
      )}
      <Botao
        rotulo={lotada ? 'Entrar na lista de espera' : 'Reservar vaga'}
        pendente="Reservando…"
        variante={lotada ? 'outline' : 'default'}
      />
    </form>
  )
}

function Desmarcar({ bookingId, esperando }: { bookingId: string; esperando: boolean }) {
  const [state, formAction] = useActionState(cancelBookingAction, initialScheduleState)

  return (
    <form action={formAction}>
      <input type="hidden" name="bookingId" value={bookingId} />
      {state.status !== 'idle' && (
        <div className="mb-2">
          <Feedback
            tone={state.status === 'success' ? 'success' : 'error'}
            message={state.message ?? ''}
          />
        </div>
      )}
      <Botao
        rotulo={esperando ? 'Sair da lista de espera' : 'Desmarcar'}
        pendente="Desmarcando…"
        variante="outline"
      />
    </form>
  )
}

function Botao({
  rotulo,
  pendente,
  variante,
}: {
  rotulo: string
  pendente: string
  variante: 'default' | 'outline'
}) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" variant={variante} disabled={pending} className="w-full">
      {pending ? pendente : rotulo}
    </Button>
  )
}
