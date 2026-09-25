'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Plus, Trash2 } from 'lucide-react'

import { Field, Feedback, SELECT_CLASS } from '@/components/synse/form-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { saveNutritionPlanAction } from '@/features/nutrition/actions'
import { initialNutritionState } from '@/features/nutrition/state'
import type { NutritionPlanWithMeals } from '@/types/domain'

/**
 * O editor do plano.
 *
 * Refeições e itens são linhas paralelas no formulário, recompostas pelo índice
 * no servidor — o mesmo desenho do montador de treino. Campos não controlados:
 * o nutricionista digita uma consulta inteira, e uma conexão que cai não pode
 * apagar o que ele escreveu.
 */

type LinhaItem = { chave: number; refeicao: number }

export function NutritionPlanEditor({
  alunos,
  plan,
}: {
  alunos: Array<{ id: string; name: string }>
  plan?: NutritionPlanWithMeals
}) {
  const [state, formAction] = useActionState(saveNutritionPlanAction, initialNutritionState)

  // Só as chaves ficam no estado; o que foi digitado mora no DOM.
  const [refeicoes, setRefeicoes] = useState<number[]>(() =>
    plan ? plan.meals.map((_, i) => i) : [0, 1, 2],
  )
  const [itens, setItens] = useState<LinhaItem[]>(() =>
    plan
      ? plan.meals.flatMap((refeicao, i) =>
          refeicao.items.map((_, j) => ({ chave: i * 100 + j, refeicao: i })),
        )
      : [0, 1, 2].flatMap((i) => [{ chave: i * 100, refeicao: i }]),
  )
  const [proxima, setProxima] = useState(10_000)

  const itensDa = (refeicao: number) => itens.filter((item) => item.refeicao === refeicao)

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {plan && <input type="hidden" name="planId" value={plan.id} />}

      {state.status === 'success' && (
        <Feedback tone="success" message={state.message ?? ''}>
          <Button variant="link" size="sm" asChild className="h-auto p-0">
            <Link href={`/nutrition/${state.planId ?? plan?.id}`}>Abrir e publicar</Link>
          </Button>
        </Feedback>
      )}
      {state.status === 'error' && <Feedback tone="error" message={state.message ?? ''} />}

      <fieldset className="space-y-4">
        <legend className="mb-3 text-sm font-semibold text-synse-text">O plano</legend>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            id="studentId"
            label="Aluno"
            errors={state.fieldErrors?.studentId}
            input={
              <select
                id="studentId"
                name="studentId"
                defaultValue={plan?.studentId ?? ''}
                disabled={Boolean(plan)}
                className={SELECT_CLASS}
              >
                <option value="">Escolher aluno…</option>
                {alunos.map((aluno) => (
                  <option key={aluno.id} value={aluno.id}>
                    {aluno.name}
                  </option>
                ))}
              </select>
            }
          />
          <Field
            id="title"
            label="Título"
            errors={state.fieldErrors?.title}
            input={
              <Input
                id="title"
                name="title"
                required
                maxLength={100}
                defaultValue={plan?.title ?? ''}
                placeholder="Plano de manutenção"
              />
            }
          />
        </div>
        {/* O aluno não muda depois: versão nova é do mesmo plano, de outra
            pessoa é outro plano. O campo desabilitado precisa viajar mesmo
            assim. */}
        {plan && <input type="hidden" name="studentId" value={plan.studentId} />}
      </fieldset>

      <fieldset className="grid grid-cols-2 gap-4 border-t border-synse-border pt-6 sm:grid-cols-4">
        <legend className="mb-1 text-sm font-semibold text-synse-text">Meta diária</legend>
        <Field
          id="targetCalories"
          label="Calorias"
          errors={state.fieldErrors?.targetCalories}
          input={
            <Input
              id="targetCalories"
              name="targetCalories"
              type="number"
              min="0"
              defaultValue={plan?.targetCalories ?? ''}
            />
          }
        />
        <Field
          id="targetProteinG"
          label="Proteína (g)"
          errors={state.fieldErrors?.targetProteinG}
          input={
            <Input
              id="targetProteinG"
              name="targetProteinG"
              type="number"
              min="0"
              defaultValue={plan?.targetProteinG ?? ''}
            />
          }
        />
        <Field
          id="targetCarbsG"
          label="Carboidrato (g)"
          errors={state.fieldErrors?.targetCarbsG}
          input={
            <Input
              id="targetCarbsG"
              name="targetCarbsG"
              type="number"
              min="0"
              defaultValue={plan?.targetCarbsG ?? ''}
            />
          }
        />
        <Field
          id="targetFatG"
          label="Gordura (g)"
          errors={state.fieldErrors?.targetFatG}
          input={
            <Input
              id="targetFatG"
              name="targetFatG"
              type="number"
              min="0"
              defaultValue={plan?.targetFatG ?? ''}
            />
          }
        />
      </fieldset>

      <fieldset className="space-y-4 border-t border-synse-border pt-6">
        <legend className="mb-1 text-sm font-semibold text-synse-text">Refeições</legend>
        <p className="text-xs text-synse-muted">
          Refeição sem nome e item sem descrição são descartados ao salvar.
        </p>

        {refeicoes.map((chaveRefeicao, ordem) => (
          <div
            key={chaveRefeicao}
            className="rounded-xl border border-synse-border bg-synse-surface-2 p-3"
          >
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label
                  htmlFor={`meal-${chaveRefeicao}`}
                  className="text-xs font-semibold text-synse-muted"
                >
                  {ordem + 1}ª refeição
                </label>
                <Input
                  id={`meal-${chaveRefeicao}`}
                  name="mealName"
                  defaultValue={plan?.meals[ordem]?.name ?? ''}
                  placeholder="Café da manhã"
                />
              </div>
              <Input
                name="mealTime"
                type="time"
                defaultValue={plan?.meals[ordem]?.timeOfDay ?? ''}
                aria-label={`Horário da ${ordem + 1}ª refeição`}
                className="w-32"
              />
              {refeicoes.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setRefeicoes((atual) => atual.filter((k) => k !== chaveRefeicao))
                    setItens((atual) => atual.filter((i) => i.refeicao !== chaveRefeicao))
                  }}
                  aria-label={`Remover a ${ordem + 1}ª refeição`}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              )}
            </div>

            <ul className="mt-3 space-y-2">
              {itensDa(chaveRefeicao).map((item, indiceItem) => (
                <li key={item.chave} className="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_90px_70px_70px_70px_70px_40px]">
                  {/*
                    A qual refeição o item pertence. Vai pelo índice da ordem
                    atual, que é como o servidor recompõe.
                  */}
                  <input type="hidden" name="itemMeal" value={ordem} />
                  <Input
                    name="itemDescription"
                    defaultValue={plan?.meals[ordem]?.items[indiceItem]?.description ?? ''}
                    placeholder="Ovos mexidos"
                    aria-label="Descrição do item"
                    className="col-span-2 sm:col-span-1"
                  />
                  <Input
                    name="itemQuantity"
                    defaultValue={plan?.meals[ordem]?.items[indiceItem]?.quantity ?? ''}
                    placeholder="3 un"
                    aria-label="Quantidade"
                  />
                  <Input
                    name="itemCalories"
                    type="number"
                    min="0"
                    defaultValue={plan?.meals[ordem]?.items[indiceItem]?.calories ?? ''}
                    placeholder="kcal"
                    aria-label="Calorias"
                  />
                  <Input
                    name="itemProtein"
                    type="number"
                    min="0"
                    defaultValue={plan?.meals[ordem]?.items[indiceItem]?.proteinG ?? ''}
                    placeholder="P"
                    aria-label="Proteína em gramas"
                  />
                  <Input
                    name="itemCarbs"
                    type="number"
                    min="0"
                    defaultValue={plan?.meals[ordem]?.items[indiceItem]?.carbsG ?? ''}
                    placeholder="C"
                    aria-label="Carboidrato em gramas"
                  />
                  <Input
                    name="itemFat"
                    type="number"
                    min="0"
                    defaultValue={plan?.meals[ordem]?.items[indiceItem]?.fatG ?? ''}
                    placeholder="G"
                    aria-label="Gordura em gramas"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setItens((atual) => atual.filter((i) => i.chave !== item.chave))}
                    aria-label="Remover item"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => {
                setItens((atual) => [...atual, { chave: proxima, refeicao: chaveRefeicao }])
                setProxima((n) => n + 1)
              }}
            >
              <Plus className="size-4" aria-hidden />
              Item
            </Button>
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setRefeicoes((atual) => [...atual, proxima])
            setProxima((n) => n + 1)
          }}
        >
          <Plus className="size-4" aria-hidden />
          Adicionar refeição
        </Button>
      </fieldset>

      <div className="border-t border-synse-border pt-6">
        <Field
          id="notes"
          label="Orientações"
          hint="Aparece para o aluno abaixo das refeições."
          errors={state.fieldErrors?.notes}
          input={
            <Textarea
              id="notes"
              name="notes"
              rows={3}
              maxLength={600}
              defaultValue={plan?.notes ?? ''}
              placeholder="Beber 2,5 litros de água por dia. Ajustar após a próxima avaliação."
            />
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-synse-border pt-6">
        <SubmitButton />
        <Button variant="ghost" asChild>
          <Link href="/nutrition">Cancelar</Link>
        </Button>
      </div>
    </form>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Salvando…' : 'Salvar rascunho'}
    </Button>
  )
}
