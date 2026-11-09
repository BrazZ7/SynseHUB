'use client'

import Link from 'next/link'
import { Plus, Trash2 } from 'lucide-react'
import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'

import { Field, Feedback } from '@/components/synse/form-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ExercisePicker } from '@/features/workouts/exercise-picker'
import { createWorkoutAction, updateWorkoutAction } from '@/features/workouts/actions'
import { initialWorkoutState } from '@/features/workouts/state'
import type { Exercise } from '@/types/domain'

/** O treino que já existe, quando o formulário abre para editar. */
export type TreinoParaEditar = {
  id: string
  name: string
  goal: string | null
  splitLabel: string
  exercises: Array<{
    exerciseId: string
    sets: number
    reps: string
    restSeconds: number
    suggestedLoad: number | null
    notes: string | null
  }>
}

/**
 * Montagem de treino — a mesma tela cria e edita.
 *
 * A lista de exercícios é uma lista de linhas, e cada linha manda os campos com
 * o mesmo nome — o servidor recompõe pelo índice. Manter isso em HTML puro, sem
 * estado de formulário em JavaScript, tem uma vantagem concreta: o professor que
 * perde a conexão no meio da montagem não perde o que digitou, porque nada
 * depende de uma requisição para existir na tela.
 *
 * Editar reaproveita a mesma marcação porque o que muda é só o ponto de
 * partida dos campos e para onde o formulário aponta. Duas telas quase iguais
 * seriam dois lugares para corrigir cada ajuste de rótulo.
 */
export function NewWorkoutForm({
  exercises,
  treino,
}: {
  exercises: Exercise[]
  treino?: TreinoParaEditar
}) {
  const editando = Boolean(treino)
  const [state, formAction] = useActionState(
    editando ? updateWorkoutAction : createWorkoutAction,
    initialWorkoutState,
  )

  /*
   * Só as chaves das linhas moram no estado; os valores ficam no DOM, onde o
   * navegador os preserva. Editando, começa com uma chave por exercício que já
   * existe — as linhas nascem preenchidas pelos `defaultValue` abaixo.
   */
  const partida = treino?.exercises.length ? treino.exercises.map((_, i) => i) : [0, 1, 2]
  const [linhas, setLinhas] = useState<number[]>(partida)
  const [proxima, setProxima] = useState(partida.length)

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {treino && <input type="hidden" name="planId" value={treino.id} />}

      {state.status === 'success' && (
        <Feedback tone="success" message={state.message ?? ''}>
          {state.createdId && (
            <Button variant="link" size="sm" asChild className="h-auto p-0">
              <Link href={`/workouts/${state.createdId}`}>
                {editando ? 'Voltar ao treino' : 'Abrir treino e atribuir a um aluno'}
              </Link>
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
            input={
              <Input
                id="name"
                name="name"
                required
                defaultValue={treino?.name}
                placeholder="Superiores — força"
              />
            }
          />
          <Field
            id="splitLabel"
            label="Divisão"
            hint="A, B, C…"
            errors={state.fieldErrors?.splitLabel}
            input={
              <Input
                id="splitLabel"
                name="splitLabel"
                defaultValue={treino?.splitLabel ?? 'A'}
                maxLength={8}
              />
            }
          />
        </div>

        <Field
          id="goal"
          label="Objetivo"
          hint="Aparece para o aluno abaixo do nome do treino."
          errors={state.fieldErrors?.goal}
          input={
            <Input
              id="goal"
              name="goal"
              defaultValue={treino?.goal ?? ''}
              placeholder="Hipertrofia, 3x por semana"
            />
          }
        />
      </fieldset>

      <fieldset className="space-y-3 border-t border-synse-border pt-6">
        <legend className="mb-1 text-sm font-semibold text-synse-text">Exercícios</legend>
        <p className="text-xs text-synse-muted">
          Na ordem em que devem ser feitos. Linha sem exercício escolhido é ignorada.
        </p>

        <ol className="space-y-3">
          {linhas.map((chave, indice) => {
            const atual = treino?.exercises[chave]

            return (
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
                  <div className="col-span-2 sm:col-span-1">
                    <ExercisePicker
                      name="exerciseId"
                      exercicios={exercises}
                      defaultValue={atual?.exerciseId ?? ''}
                      rotulo={`Exercício ${indice + 1}`}
                    />
                  </div>

                  <Input
                    name="sets"
                    type="number"
                    min="1"
                    max="20"
                    defaultValue={atual?.sets ?? 3}
                    aria-label={`Séries do ${indice + 1}º exercício`}
                    placeholder="Séries"
                  />
                  <Input
                    name="reps"
                    defaultValue={atual?.reps ?? '12'}
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
                    defaultValue={atual?.restSeconds ?? 60}
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
                    defaultValue={atual?.suggestedLoad ?? ''}
                    aria-label={`Carga sugerida do ${indice + 1}º exercício`}
                    placeholder="Carga (kg)"
                  />
                  <Input
                    name="notes"
                    maxLength={160}
                    defaultValue={atual?.notes ?? ''}
                    aria-label={`Observação do ${indice + 1}º exercício`}
                    placeholder="Observação para o aluno"
                  />
                </div>
              </li>
            )
          })}
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
        <SubmitButton editando={editando} />
        <Button variant="ghost" asChild>
          <Link href={treino ? `/workouts/${treino.id}` : '/workouts'}>Cancelar</Link>
        </Button>
      </div>
    </form>
  )
}

function SubmitButton({ editando }: { editando: boolean }) {
  const { pending } = useFormStatus()
  const parado = editando ? 'Salvar alterações' : 'Criar treino'
  return (
    <Button type="submit" disabled={pending}>
      {pending ? (editando ? 'Salvando…' : 'Criando…') : parado}
    </Button>
  )
}
