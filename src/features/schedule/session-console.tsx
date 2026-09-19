'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Check, UserMinus, UserPlus, X } from 'lucide-react'

import { Feedback, SELECT_CLASS } from '@/components/synse/form-field'
import { StudentAvatar } from '@/components/synse/student-avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  bookForStudentAction,
  cancelSessionAction,
  markAttendanceAction,
} from '@/features/schedule/actions'
import { initialScheduleState } from '@/features/schedule/state'
import type { ClassBooking, ClassSession } from '@/types/domain'

/**
 * A aula de um dia, do ponto de vista de quem opera.
 *
 * Três ações que convivem na mesma tela porque é assim que a recepção trabalha:
 * marca quem chegou, encaixa quem ligou, e cancela quando o professor falta.
 */
export function SessionConsole({
  sessao,
  reservas,
  alunos,
  podeEscrever,
}: {
  sessao: ClassSession
  reservas: ClassBooking[]
  alunos: Array<{ id: string; name: string }>
  podeEscrever: boolean
}) {
  const confirmadas = reservas.filter((r) => r.status === 'BOOKED' || r.status === 'ATTENDED')
  const espera = reservas.filter((r) => r.status === 'WAITLIST')
  const jaComecou = new Date(sessao.startsAt).getTime() <= Date.now()
  const cancelada = sessao.status === 'CANCELLED'

  return (
    <div className="space-y-5">
      {podeEscrever && !cancelada && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <EncaixarAluno sessao={sessao} alunos={alunos} reservas={reservas} />
          <CancelarAula sessao={sessao} />
        </div>
      )}

      <Lista
        titulo={`Confirmados (${confirmadas.length} de ${sessao.capacity})`}
        reservas={confirmadas}
        sessao={sessao}
        podeEscrever={podeEscrever && !cancelada}
        chamada={jaComecou}
      />

      {espera.length > 0 && (
        <Lista
          titulo={`Lista de espera (${espera.length})`}
          descricao="Na ordem em que pediram. Quem desmarcar abre a vaga para o primeiro da fila, automaticamente."
          reservas={espera}
          sessao={sessao}
          podeEscrever={false}
          chamada={false}
        />
      )}
    </div>
  )
}

function Lista({
  titulo,
  descricao,
  reservas,
  sessao,
  podeEscrever,
  chamada,
}: {
  titulo: string
  descricao?: string
  reservas: ClassBooking[]
  sessao: ClassSession
  podeEscrever: boolean
  chamada: boolean
}) {
  return (
    <section className="rounded-xl border border-synse-border bg-synse-surface p-4">
      <h2 className="text-sm font-semibold text-synse-text">{titulo}</h2>
      {descricao && <p className="mt-1 text-xs text-synse-muted">{descricao}</p>}

      {reservas.length === 0 ? (
        <p className="mt-3 text-sm text-synse-muted">Ninguém ainda.</p>
      ) : (
        <ul className="mt-3 divide-y divide-synse-border">
          {reservas.map((reserva, indice) => (
            <li key={reserva.id} className="flex items-center gap-3 py-2.5">
              <span className="w-5 text-xs tabular-nums text-synse-muted">{indice + 1}</span>
              <StudentAvatar name={reserva.studentName ?? 'Aluno'} size="sm" />
              <span className="flex-1 truncate text-sm text-synse-text">
                {reserva.studentName ?? 'Aluno'}
              </span>

              {reserva.status === 'ATTENDED' && <Badge variant="success">Presente</Badge>}
              {reserva.status === 'NO_SHOW' && <Badge variant="warning">Faltou</Badge>}

              {podeEscrever && chamada && reserva.status !== 'NO_SHOW' && (
                <Chamada
                  bookingId={reserva.id}
                  sessionId={sessao.id}
                  jaPresente={reserva.status === 'ATTENDED'}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Presente / faltou. Só aparece depois que a aula começou. */
function Chamada({
  bookingId,
  sessionId,
  jaPresente,
}: {
  bookingId: string
  sessionId: string
  jaPresente: boolean
}) {
  const [state, formAction] = useActionState(markAttendanceAction, initialScheduleState)

  return (
    <form action={formAction} className="flex items-center gap-1">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="sessionId" value={sessionId} />
      {state.status === 'error' && <span className="sr-only">{state.message}</span>}

      {!jaPresente && (
        <Button
          type="submit"
          name="status"
          value="ATTENDED"
          variant="ghost"
          size="sm"
          aria-label="Marcar presença"
        >
          <Check className="size-4" aria-hidden />
        </Button>
      )}
      <Button
        type="submit"
        name="status"
        value="NO_SHOW"
        variant="ghost"
        size="sm"
        aria-label="Marcar falta"
      >
        <X className="size-4" aria-hidden />
      </Button>
    </form>
  )
}

function EncaixarAluno({
  sessao,
  alunos,
  reservas,
}: {
  sessao: ClassSession
  alunos: Array<{ id: string; name: string }>
  reservas: ClassBooking[]
}) {
  const [state, formAction] = useActionState(bookForStudentAction, initialScheduleState)

  // Quem já tem reserva viva não precisa aparecer na lista de encaixe.
  const jaNaAula = new Set(
    reservas.filter((r) => r.status === 'BOOKED' || r.status === 'WAITLIST').map((r) => r.studentId),
  )
  const disponiveis = alunos.filter((aluno) => !jaNaAula.has(aluno.id))

  return (
    <form action={formAction} className="rounded-xl border border-synse-border p-4">
      <input type="hidden" name="sessionId" value={sessao.id} />
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-synse-text">
        <UserPlus className="size-4" aria-hidden />
        Encaixar aluno
      </h2>
      <p className="mb-3 text-xs text-synse-muted">
        Para quem ligou na recepção. Turma cheia manda para a lista de espera — não fura a fila.
      </p>

      {state.status !== 'idle' && (
        <div className="mb-3">
          <Feedback
            tone={state.status === 'success' ? 'success' : 'error'}
            message={state.message ?? ''}
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <select name="studentId" defaultValue="" className={`${SELECT_CLASS} flex-1`} aria-label="Aluno">
          <option value="">Escolher aluno…</option>
          {disponiveis.map((aluno) => (
            <option key={aluno.id} value={aluno.id}>
              {aluno.name}
            </option>
          ))}
        </select>
        <BotaoEnviar rotulo="Reservar" pendente="Reservando…" />
      </div>
    </form>
  )
}

function CancelarAula({ sessao }: { sessao: ClassSession }) {
  const [state, formAction] = useActionState(cancelSessionAction, initialScheduleState)

  return (
    <form action={formAction} className="border-synse-danger/25 rounded-xl border p-4">
      <input type="hidden" name="sessionId" value={sessao.id} />
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-synse-text">
        <UserMinus className="size-4" aria-hidden />
        Cancelar esta aula
      </h2>
      <p className="mb-3 text-xs text-synse-muted">
        Só este dia — a aula das outras semanas continua. Os {sessao.bookedCount} confirmados
        recebem o aviso no app.
      </p>

      {state.status !== 'idle' && (
        <div className="mb-3">
          <Feedback
            tone={state.status === 'success' ? 'success' : 'error'}
            message={state.message ?? ''}
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Input
          name="reason"
          maxLength={200}
          placeholder="Motivo (vai no aviso)"
          aria-label="Motivo do cancelamento"
          className="flex-1"
        />
        <BotaoEnviar rotulo="Cancelar aula" pendente="Cancelando…" variante="danger" />
      </div>
    </form>
  )
}

function BotaoEnviar({
  rotulo,
  pendente,
  variante,
}: {
  rotulo: string
  pendente: string
  variante?: 'danger'
}) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} variant={variante === 'danger' ? 'outline' : 'default'}>
      {pending ? pendente : rotulo}
    </Button>
  )
}
