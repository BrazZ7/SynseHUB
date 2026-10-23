'use client'

import { CircleCheck, Search, TriangleAlert, UserCheck } from 'lucide-react'
import { useActionState, useEffect, useState, useTransition } from 'react'

import { StudentAvatar } from '@/components/synse/student-avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { registerCheckInAction } from '@/features/checkin/actions'
import { initialCheckInState } from '@/features/checkin/state'
import { buscarAlunosAction } from '@/features/students/busca-de-aluno'
import type { AlunoEncontrado } from '@/features/students/busca-state'
import { cn } from '@/lib/utils'

/**
 * ── Console de recepção ─────────────────────────────────────────────────────
 *
 * A busca acontece no servidor, e isto é um conserto.
 *
 * Antes ela filtrava uma lista já carregada — o comentário aqui dizia
 * "(limitada)" e seguia em frente. O limite era 100: `listStudents` corta a
 * página em `Math.min(100, …)` nos dois data sources, e o `pageSize: 100` que
 * a página pedia batia nele. Numa academia com 478 alunos, a recepção digitava
 * o nome de quem estava na frente dela e lia "Nenhum aluno encontrado" —
 * para alguém que está cadastrado, de pé, no balcão.
 *
 * É a pior forma do defeito: a tela parecia funcionar, e errava exatamente
 * nos quatro em cada cinco alunos que não cabiam na primeira página.
 */
export function CheckInConsole() {
  const [state, formAction, pending] = useActionState(registerCheckInAction, initialCheckInState)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<AlunoEncontrado[]>([])
  const [erroDaBusca, setErroDaBusca] = useState<string | null>(null)
  const [buscando, iniciarBusca] = useTransition()

  useEffect(() => {
    /*
     * Espera parar de digitar. Sem isto, "Ana Cardoso" dispara onze consultas
     * e as respostas chegam fora de ordem — a lista pisca conforme a rede
     * decide, no momento em que alguém espera no balcão.
     */
    const tempo = setTimeout(() => {
      iniciarBusca(async () => {
        // `false`: no balcão aparece quem está suspenso e quem está em atraso,
        // e é justamente aí que a recepção precisa ver a situação.
        const resultado = await buscarAlunosAction(query, false)
        if (resultado.ok) {
          setResults(resultado.alunos)
          setErroDaBusca(null)
        } else {
          setResults([])
          setErroDaBusca(resultado.erro)
        }
      })
    }, 250)

    return () => clearTimeout(tempo)
  }, [query])

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
          {buscando
            ? 'Buscando…'
            : (erroDaBusca ??
              (query
                ? `Nenhum aluno encontrado para “${query}”.`
                : 'Digite o nome ou o Synse ID para encontrar o aluno.'))}
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
