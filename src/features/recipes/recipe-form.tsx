'use client'

import { Globe, Loader2, Sparkles } from 'lucide-react'
import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'

import { Field, Feedback } from '@/components/synse/form-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { salvarReceitaAction } from '@/features/recipes/admin-actions'
import { recipeAdminInicial } from '@/features/recipes/admin-state'
import { CATEGORIAS, CATEGORIAS_LISTA } from '@/lib/validations/recipe'
import { cn } from '@/lib/utils'
import type { Recipe } from '@/types/domain'

/**
 * O formulário da receita.
 *
 * A visibilidade é escolha em dois cartões, como no acervo e nos programas:
 * errar para o lado de trancar se desfaz num clique, e errar para o lado de
 * abrir não desfaz quem já copiou. O padrão é o Synse+.
 */
const OPCOES = [
  {
    valor: 'SYNSE_PLUS' as const,
    rotulo: 'Só assinantes',
    icone: Sparkles,
    frase: 'Quem tem Synse+ vigente.',
  },
  { valor: 'FREE' as const, rotulo: 'Aberta a todos', icone: Globe, frase: 'Qualquer conta.' },
]

/** `null` vira `''` no campo — `value={null}` deixa o input descontrolado. */
function texto(valor: number | null | undefined): string {
  return valor == null ? '' : String(valor)
}

export function RecipeForm({ receita }: { receita?: Recipe }) {
  const [state, formAction] = useActionState(salvarReceitaAction, recipeAdminInicial)
  const [visibilidade, setVisibilidade] = useState<'FREE' | 'SYNSE_PLUS'>(
    receita?.visibility === 'FREE' ? 'FREE' : 'SYNSE_PLUS',
  )

  const macros = receita?.nutritionFacts ?? {}

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {receita && <input type="hidden" name="recipeId" value={receita.id} />}
      <input type="hidden" name="visibility" value={visibilidade} />

      {state.status === 'success' && <Feedback tone="success" message={state.message ?? ''} />}
      {state.status === 'error' && <Feedback tone="error" message={state.message ?? ''} />}

      <div className="grid gap-3 sm:grid-cols-2">
        {OPCOES.map(({ valor, rotulo, icone: Icone, frase }) => (
          <button
            key={valor}
            type="button"
            onClick={() => setVisibilidade(valor)}
            aria-pressed={visibilidade === valor}
            className={cn(
              'rounded-xl border p-4 text-left transition-colors',
              visibilidade === valor
                ? 'border-synse-primary bg-synse-primary/10'
                : 'border-synse-border bg-synse-surface hover:border-synse-primary/40',
            )}
          >
            <Icone className="size-4 text-synse-primary" aria-hidden />
            <p className="mt-2 text-sm font-medium text-synse-text">{rotulo}</p>
            <p className="mt-0.5 text-xs text-synse-muted">{frase}</p>
          </button>
        ))}
      </div>

      <Field
        id="title"
        label="Título"
        errors={state.fieldErrors?.title}
        input={
          <Input id="title" name="title" maxLength={140} defaultValue={receita?.title ?? ''} />
        }
      />

      <Field
        id="category"
        label="Categoria"
        errors={state.fieldErrors?.category}
        input={
          <select
            id="category"
            name="category"
            defaultValue={receita?.category ?? 'ALMOCO'}
            className="h-11 w-full rounded-xl border border-synse-border bg-synse-surface px-3 text-sm text-synse-text outline-none focus-visible:border-synse-primary"
          >
            {CATEGORIAS_LISTA.map((chave) => (
              <option key={chave} value={chave}>
                {CATEGORIAS[chave]}
              </option>
            ))}
          </select>
        }
      />

      <Field
        id="description"
        label="Descrição"
        hint="Uma linha, que é o que aparece no cartão e na vitrine."
        errors={state.fieldErrors?.description}
        input={
          <Textarea
            id="description"
            name="description"
            rows={2}
            maxLength={600}
            defaultValue={receita?.description ?? ''}
          />
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="prepMinutes"
          label="Preparo (minutos)"
          errors={state.fieldErrors?.prepMinutes}
          input={
            <Input
              id="prepMinutes"
              name="prepMinutes"
              type="number"
              min={1}
              max={1440}
              defaultValue={texto(receita?.prepMinutes)}
            />
          }
        />
        <Field
          id="servings"
          label="Porções"
          errors={state.fieldErrors?.servings}
          input={
            <Input
              id="servings"
              name="servings"
              type="number"
              min={1}
              max={50}
              defaultValue={texto(receita?.servings)}
            />
          }
        />
      </div>

      <Field
        id="ingredients"
        label="Ingredientes"
        hint="Um por linha."
        errors={state.fieldErrors?.ingredients}
        input={
          <Textarea
            id="ingredients"
            name="ingredients"
            rows={6}
            maxLength={4000}
            defaultValue={(receita?.ingredients ?? []).join('\n')}
            placeholder={'3 ovos\n1 xícara de aveia'}
          />
        }
      />

      <Field
        id="instructions"
        label="Modo de preparo"
        hint="Linha em branco separa um passo do outro."
        errors={state.fieldErrors?.instructions}
        input={
          <Textarea
            id="instructions"
            name="instructions"
            rows={8}
            maxLength={8000}
            defaultValue={receita?.instructions ?? ''}
          />
        }
      />

      {/*
        Os macros em quatro campos, e não um JSON digitado à mão: a coluna é
        `jsonb` livre no banco, o que é certo para guardar, mas pedir JSON num
        formulário é pedir erro de sintaxe de quem está escrevendo receita.
      */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-synse-text">Por porção (opcional)</legend>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field
            id="kcal"
            label="Calorias"
            errors={state.fieldErrors?.kcal}
            input={
              <Input
                id="kcal"
                name="kcal"
                type="number"
                min={0}
                defaultValue={texto(macros.kcal)}
              />
            }
          />
          <Field
            id="protein"
            label="Proteína (g)"
            errors={state.fieldErrors?.protein}
            input={
              <Input
                id="protein"
                name="protein"
                type="number"
                min={0}
                defaultValue={texto(macros.protein)}
              />
            }
          />
          <Field
            id="carbs"
            label="Carbo. (g)"
            errors={state.fieldErrors?.carbs}
            input={
              <Input
                id="carbs"
                name="carbs"
                type="number"
                min={0}
                defaultValue={texto(macros.carbs)}
              />
            }
          />
          <Field
            id="fat"
            label="Gordura (g)"
            errors={state.fieldErrors?.fat}
            input={
              <Input id="fat" name="fat" type="number" min={0} defaultValue={texto(macros.fat)} />
            }
          />
        </div>
      </fieldset>

      <Field
        id="imageUrl"
        label="Foto do prato"
        errors={state.fieldErrors?.imageUrl}
        input={
          <Input
            id="imageUrl"
            name="imageUrl"
            type="url"
            defaultValue={receita?.imageUrl ?? ''}
            placeholder="https://"
          />
        }
      />

      <Field
        id="tags"
        label="Etiquetas"
        hint="Separadas por vírgula. Ex.: marmita, proteico"
        errors={state.fieldErrors?.tags}
        input={
          <Input
            id="tags"
            name="tags"
            maxLength={400}
            defaultValue={(receita?.tags ?? []).join(', ')}
          />
        }
      />

      <Enviar rotulo={receita ? 'Salvar alterações' : 'Criar receita'} />
    </form>
  )
}

function Enviar({ rotulo }: { rotulo: string }) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {rotulo}
    </Button>
  )
}
