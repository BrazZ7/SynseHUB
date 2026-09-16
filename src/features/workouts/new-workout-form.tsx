'use client'

import Link from 'next/link'
import { Plus, Trash2 } from 'lucide-react'
import { useActionState, useMemo, useState } from 'react'
import { useFormStatus } from 'react-dom'

import { Field, Feedback, SELECT_CLASS } from '@/components/synse/form-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  exerciseOptionLabel,
  groupExercisesForSelect,
} from '@/features/workouts/group-exercises'
import { createWorkoutAction } from '@/features/workouts/actions'
import { initialWorkoutState } from '@/features/workouts/state'
import type { Exercise } from '@/types/domain'

/**
 * Montagem de treino.
 *
 * A lista de exercícios é uma lista de linhas, e cada linha manda os campos com
 * o mesmo nome — o servidor recompõe pelo índice. Manter isso em HTML puro, sem
 * estado de formulário em JavaScript, tem uma vantagem concreta: o professor que
 * perde a conexão no meio da montagem não perde o que digitou, porque nada
 * depende de uma requisição para existir na tela.
 */
export function NewWorkoutForm({ exercises }: { exercises: Exercise[] }) {
  const [state, formAction] = useActionState(createWorkoutAction, initialWorkoutState)

  /*
   * O agrupamento é estável enquanto a biblioteca não muda, e a lista tem
   * 132 itens: refazer isso a cada linha adicionada custaria sem motivo.
   */
  const grupos = useMemo(() => groupExercisesForSelect(exercises), [exercises])

  // Só as chaves das linhas moram no estado; os valores ficam no DOM, onde o
  // navegador os preserva.
  const [linhas, setLinhas] = useState<number[]>([0, 1, 2])
  const [proxima, setProxima] = useState(3)

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {state.status === 'success' && (
        <Feedback tone="success" message={state.message ?? ''}>
          {state.createdId && (
            <Button variant="link" size="sm" asChild className="h-auto p-0">
              <Link href={`/workouts/${state.createdId}`}>Abrir treino e atribuir a um aluno</Link>
            </Button>
          )}
        </Feedback>
      )}
      {state.status === 'error' && <Feedback tone="error" message={state.message ?? ''} />}

      <fieldset className="space-y-4">
        <legend className="mb-3 text-sm font-semibold text-synse-text">O treino</legend>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_120px]">
          <Field
            id="name"
            label="Nome"
            errors={state.fieldErrors?.name}
            input={<Input id="name" name="name" required placeholder="Superiores — força" />}
          />
          <Field
            id="splitLabel"
            label="Divisão"
            hint="A, B, C…"
            errors={state.fieldErrors?.splitLabel}
            input={<Input id="splitLabel" name="splitLabel" defaultValue="A" maxLength={8} />}
          />
        </div>

        <Field
          id="goal"
          label="Objetivo"
          hint="Aparece para o aluno abaixo do nome do treino."
          errors={state.fieldErrors?.goal}
          input={<Input id="goal" name="goal" placeholder="Hipertrofia, 3x por semana" />}
        />
      </fieldset>

      <fieldset className="space-y-3 border-t border-synse-border pt-6">
        <legend className="mb-1 text-sm font-semibold text-synse-text">Exercícios</legend>
        <p className="text-xs text-synse-muted">
          Na ordem em que devem ser feitos. Linha sem exercício escolhido é ignorada.
        </p>

        <ol className="space-y-3">
          {linhas.map((chave, indice) => (
            <li
              key={chave}
              className="rounded-xl border border-synse-border bg-synse-surface-2 p-3"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-synse-muted">{indice + 1}º</span>
                {linhas.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setLinhas((atual) => atual.filter((k) => k !== chave))}
                    aria-label={`Remover o ${indice + 1}º exercício`}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_70px_90px_90px]">
                <select
                  name="exerciseId"
                  defaultValue=""
                  aria-label={`Exercício ${indice + 1}`}
                  className={`${SELECT_CLASS} col-span-2 sm:col-span-1`}
                >
                  <option value="">Escolher exercício…</option>
                  {grupos.map((grupo) => (
                    <optgroup key={grupo.label} label={grupo.label}>
                      {grupo.exercises.map((exercicio) => (
                        <option key={exercicio.id} value={exercicio.id}>
                          {exerciseOptionLabel(exercicio)}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>

                <Input
                  name="sets"
                  type="number"
                  min="1"
                  max="20"
                  defaultValue="3"
                  aria-label={`Séries do ${indice + 1}º exercício`}
                  placeholder="Séries"
                />
                <Input
                  name="reps"
                  defaultValue="12"
                  maxLength={24}
                  aria-label={`Repetições do ${indice + 1}º exercício`}
                  placeholder="Reps"
                />
                <Input
                  name="restSeconds"
                  type="number"
                  min="0"
                  max="600"
                  step="15"
                  defaultValue="60"
                  aria-label={`Descanso em segundos do ${indice + 1}º exercício`}
                  placeholder="Descanso"
                />
              </div>

              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[120px_1fr]">
                <Input
                  name="suggestedLoad"
                  type="number"
                  min="0"
                  step="0.5"
                  aria-label={`Carga sugerida do ${indice + 1}º exercício`}
                  placeholder="Carga (kg)"
                />
                <Input
                  name="notes"
                  maxLength={160}
                  aria-label={`Observação do ${indice + 1}º exercício`}
                  placeholder="Observação para o aluno"
                />
              </div>
            </li>
          ))}
        </ol>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setLinhas((atual) => [...atual, proxima])
            setProxima((n) => n + 1)
          }}
        >
          <Plus className="size-4" aria-hidden />
          Adicionar exercício
        </Button>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 border-t border-synse-border pt-6">
        <SubmitButton />
        <Button variant="ghost" asChild>
          <Link href="/workouts">Cancelar</Link>
        </Button>
      </div>
    </form>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Criando…' : 'Criar treino'}
    </Button>
  )
}
