'use client'

import Link from 'next/link'
import { Plus, Trash2 } from 'lucide-react'
import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'

import { Field, Feedback } from '@/components/synse/form-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ExercisePicker } from '@/features/workouts/exercise-picker'
import { createWeekAction } from '@/features/workouts/actions'
import { initialWorkoutState } from '@/features/workouts/state'
import type { Exercise } from '@/types/domain'

/**
 * ── A semana inteira numa tela ───────────────────────────────────────────────
 *
 * Cada dia vira um treino separado no banco, como sempre foi. O que muda é o
 * caminho: em vez de abrir o formulário cinco vezes e repetir nome, objetivo e
 * divisão, o professor descreve a semana de uma vez.
 *
 * ── O carimbo do dia em cada linha ──────────────────────────────────────────
 *
 * O navegador não manda estrutura aninhada: manda campos repetidos. Com dias
 * dentro de dias, recompor por índice não basta — se uma linha vier faltando,
 * os exercícios escorregam de um dia para o outro, e o professor descobre isso
 * quando o aluno reclamar que a terça virou quinta.
 *
 * Por isso cada linha carrega um `rowDay` oculto com a posição do dia a que
 * pertence. O servidor agrupa por esse carimbo, não pela ordem. Há teste para
 * a linha em branco no meio, que é o caso que quebra o jeito ingênuo.
 *
 * ── Por que os valores ficam no DOM ─────────────────────────────────────────
 *
 * Só as chaves moram no estado. Montar uma semana leva tempo, e o professor que
 * perde a conexão no meio não perde o que digitou, porque nada na tela depende
 * de uma requisição para existir.
 */

/** Divisões na ordem em que a academia costuma nomear. */
const LETRAS = ['A', 'B', 'C', 'D', 'E', 'F', 'G']

type Dia = { chave: number; linhas: number[]; proxima: number }

function diaNovo(chave: number, linhas = 3): Dia {
  return { chave, linhas: Array.from({ length: linhas }, (_, i) => i), proxima: linhas }
}

export function WeekForm({ exercises }: { exercises: Exercise[] }) {
  const [state, formAction] = useActionState(createWeekAction, initialWorkoutState)

  /* A biblioteca tem mais de cem itens e não muda enquanto a tela está aberta. */

  const [dias, setDias] = useState<Dia[]>([diaNovo(0), diaNovo(1), diaNovo(2)])
  const [proximoDia, setProximoDia] = useState(3)

  const alterarDia = (chave: number, mudanca: (dia: Dia) => Dia) =>
    setDias((atual) => atual.map((dia) => (dia.chave === chave ? mudanca(dia) : dia)))

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {state.status === 'success' && (
        <Feedback tone="success" message={state.message ?? ''}>
          <Button variant="link" size="sm" asChild className="h-auto p-0">
            <Link href="/workouts">Ver os treinos da semana</Link>
          </Button>
        </Feedback>
      )}
      {state.status === 'error' && <Feedback tone="error" message={state.message ?? ''} />}

      <Field
        id="goal"
        label="Objetivo da semana"
        hint="Vale para todos os dias e aparece para o aluno abaixo do nome do treino."
        errors={state.fieldErrors?.goal}
        input={<Input id="goal" name="goal" placeholder="Hipertrofia, 5x por semana" />}
      />

      {dias.map((dia, indice) => (
        <fieldset
          key={dia.chave}
          className="space-y-3 rounded-2xl border border-synse-border bg-synse-surface-2 p-4"
        >
          <legend className="sr-only">Dia {LETRAS[indice] ?? indice + 1}</legend>

          <div className="flex flex-wrap items-end gap-3">
            <div className="w-20">
              <label
                htmlFor={`dia-${dia.chave}-label`}
                className="mb-1 block text-xs font-medium text-synse-muted"
              >
                Divisão
              </label>
              <Input
                id={`dia-${dia.chave}-label`}
                name="dayLabel"
                defaultValue={LETRAS[indice] ?? String(indice + 1)}
                maxLength={8}
              />
            </div>

            <div className="min-w-[12rem] flex-1">
              <label
                htmlFor={`dia-${dia.chave}-nome`}
                className="mb-1 block text-xs font-medium text-synse-muted"
              >
                Nome do dia
              </label>
              <Input id={`dia-${dia.chave}-nome`} name="dayName" placeholder="Pernas e glúteos" />
            </div>

            {dias.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setDias((atual) => atual.filter((d) => d.chave !== dia.chave))}
                aria-label={`Remover o dia ${LETRAS[indice] ?? indice + 1}`}
              >
                <Trash2 className="size-4" aria-hidden />
                Remover dia
              </Button>
            )}
          </div>

          <ol className="space-y-2">
            {dia.linhas.map((linha, posicao) => (
              <li
                key={linha}
                className="rounded-xl border border-synse-border bg-synse-surface p-3"
              >
                {/*
                 * O carimbo do dia. Sem ele, uma linha faltando faria os
                 * exercícios escorregarem de um dia para o outro no servidor.
                 */}
                <input type="hidden" name="rowDay" value={indice} />

                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-synse-muted">{posicao + 1}º</span>
                  {dia.linhas.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        alterarDia(dia.chave, (d) => ({
                          ...d,
                          linhas: d.linhas.filter((k) => k !== linha),
                        }))
                      }
                      aria-label={`Remover o ${posicao + 1}º exercício do dia ${LETRAS[indice] ?? indice + 1}`}
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
                      rotulo={`Exercício ${posicao + 1} do dia ${LETRAS[indice] ?? indice + 1}`}
                    />
                  </div>

                  <Input
                    name="sets"
                    type="number"
                    min="1"
                    max="20"
                    defaultValue="3"
                    aria-label={`Séries do ${posicao + 1}º exercício`}
                    placeholder="Séries"
                  />
                  <Input
                    name="reps"
                    defaultValue="12"
                    maxLength={24}
                    aria-label={`Repetições do ${posicao + 1}º exercício`}
                    placeholder="Reps"
                  />
                  <Input
                    name="restSeconds"
                    type="number"
                    min="0"
                    max="600"
                    step="15"
                    defaultValue="60"
                    aria-label={`Descanso do ${posicao + 1}º exercício`}
                    placeholder="Descanso"
                  />
                </div>

                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[120px_1fr]">
                  <Input
                    name="suggestedLoad"
                    type="number"
                    min="0"
                    step="0.5"
                    aria-label={`Carga sugerida do ${posicao + 1}º exercício`}
                    placeholder="Carga (kg)"
                  />
                  <Input
                    name="notes"
                    maxLength={160}
                    aria-label={`Observação do ${posicao + 1}º exercício`}
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
            onClick={() =>
              alterarDia(dia.chave, (d) => ({
                ...d,
                linhas: [...d.linhas, d.proxima],
                proxima: d.proxima + 1,
              }))
            }
          >
            <Plus className="size-4" aria-hidden />
            Adicionar exercício
          </Button>
        </fieldset>
      ))}

      {dias.length < 7 && (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setDias((atual) => [...atual, diaNovo(proximoDia)])
            setProximoDia((n) => n + 1)
          }}
        >
          <Plus className="size-4" aria-hidden />
          Adicionar dia
        </Button>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-synse-border pt-6">
        <SubmitButton dias={dias.length} />
        <Button variant="ghost" asChild>
          <Link href="/workouts">Cancelar</Link>
        </Button>
      </div>
    </form>
  )
}

function SubmitButton({ dias }: { dias: number }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Criando a semana…' : `Criar ${dias} ${dias === 1 ? 'treino' : 'treinos'}`}
    </Button>
  )
}
