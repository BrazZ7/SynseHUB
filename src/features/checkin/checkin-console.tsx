'use client'

import { CircleCheck, Search, TriangleAlert, UserCheck } from 'lucide-react'
import { useActionState, useMemo, useState } from 'react'

import { StudentAvatar } from '@/components/synse/student-avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { registerCheckInAction } from '@/features/checkin/actions'
import { initialCheckInState } from '@/features/checkin/state'
import { cn } from '@/lib/utils'

export type CheckInCandidate = {
  id: string
  name: string
  synseId: string
  planName: string | null
}

/**
 * Console de recepção.
 *
 * A busca acontece sobre uma lista já carregada no servidor (limitada), para
 * que o atendimento seja instantâneo no balcão sem abrir consulta a cada tecla.
 */
export function CheckInConsole({ students }: { students: CheckInCandidate[] }) {
  const [state, formAction, pending] = useActionState(registerCheckInAction, initialCheckInState)
  const [query, setQuery] = useState('')

  const results = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return students.slice(0, 8)
    return students
      .filter(
        (student) =>
          student.name.toLowerCase().includes(term) ||
          student.synseId.toLowerCase().includes(term),
      )
      .slice(0, 8)
  }, [query, students])

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="checkin-search">Buscar aluno</Label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-synse-muted"
            aria-hidden
          />
          <Input
            id="checkin-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nome ou Synse ID"
            className="pl-9"
            autoComplete="off"
          />
        </div>
      </div>

      {state.status !== 'idle' && (
        <div
          role="status"
          className={cn(
            'flex items-center gap-2.5 rounded-lg p-3 text-sm',
            state.status === 'success'
              ? 'bg-synse-success/10 text-synse-success'
              : 'bg-synse-danger/10 text-synse-danger',
          )}
        >
          {state.status === 'success' ? (
            <CircleCheck className="size-4 shrink-0 animate-fade-in" aria-hidden />
          ) : (
            <TriangleAlert className="size-4 shrink-0" aria-hidden />
          )}
          <span>
            {state.studentName ? `${state.studentName}: ` : ''}
            {state.message}
          </span>
        </div>
      )}

      {results.length === 0 ? (
        <p className="rounded-lg bg-synse-surface-2/60 p-4 text-sm text-synse-muted">
          Nenhum aluno encontrado para “{query}”.
        </p>
      ) : (
        <ul className="divide-y divide-synse-border">
          {results.map((student) => (
            <li key={student.id} className="flex items-center gap-3 py-2.5">
              <StudentAvatar name={student.name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-synse-text">{student.name}</p>
                <p className="truncate text-xs text-synse-muted">
                  {student.synseId}
                  {student.planName && ` · ${student.planName}`}
                </p>
              </div>
              <form action={formAction}>
                <input type="hidden" name="studentId" value={student.id} />
                <Button type="submit" size="sm" variant="outline" disabled={pending}>
                  <UserCheck className="size-4" />
                  Registrar
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
