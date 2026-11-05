'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

import { Field, Feedback } from '@/components/synse/form-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { inscreverAction } from '@/features/events/inscricao'
import { formatarCpf, initialInscricaoState, TAMANHOS } from '@/features/events/state'
import type { CategoriaDoEvento } from '@/types/domain'
import { cn } from '@/lib/utils'

/**
 * O formulário da inscrição pública.
 *
 * Quem preenche pode nunca ter ouvido falar do Synse — chegou por um link de
 * corrida. Então a tela não assume nada: sem jargão do produto, sem "crie sua
 * conta antes", e o aceite da política explicado em uma linha, do lado do
 * que está sendo coletado.
 */
export function FormularioDeInscricao({
  eventId,
  categorias,
  precisaDeCamiseta,
  versaoDaPolitica,
}: {
  eventId: string
  categorias: readonly CategoriaDoEvento[]
  precisaDeCamiseta: boolean
  versaoDaPolitica: string
}) {
  const [state, formAction] = useActionState(inscreverAction, initialInscricaoState)
  const [cpf, setCpf] = useState('')
  const router = useRouter()

  /*
   * Inscrição aceita manda para o comprovante. A navegação acontece aqui e
   * não na action porque o código precisa chegar à URL — é ele que a pessoa
   * guarda, e um `redirect` dentro da action perderia o estado do formulário
   * se algo falhasse no caminho.
   */
  useEffect(() => {
    if (state.status === 'success' && state.codigo) {
      router.push(`/eventos/inscricao/${state.codigo}`)
    }
  }, [state, router])

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="eventId" value={eventId} />

      {state.status === 'error' && <Feedback tone="error" message={state.message ?? ''} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field
            id="fullName"
            label="Nome completo"
            errors={state.fieldErrors?.fullName}
            input={<Input id="fullName" name="fullName" autoComplete="name" required />}
          />
        </div>

        <Field
          id="email"
          label="E-mail"
          hint="É para onde vai o comprovante."
          errors={state.fieldErrors?.email}
          input={<Input id="email" name="email" type="email" autoComplete="email" required />}
        />

        <Field
          id="phone"
          label="Telefone com DDD"
          errors={state.fieldErrors?.phone}
          input={<Input id="phone" name="phone" type="tel" autoComplete="tel" required />}
        />

        <Field
          id="taxId"
          label="CPF"
          hint="Identifica quem pagou e evita inscrição duplicada."
          errors={state.fieldErrors?.taxId}
          input={
            <Input
              id="taxId"
              name="taxId"
              inputMode="numeric"
              value={cpf}
              onChange={(evento) => setCpf(formatarCpf(evento.target.value))}
              placeholder="000.000.000-00"
              required
            />
          }
        />

        {precisaDeCamiseta && (
          <Field
            id="shirtSize"
            label="Tamanho da camiseta"
            errors={state.fieldErrors?.shirtSize}
            input={
              <select
                id="shirtSize"
                name="shirtSize"
                className="flex h-10 w-full rounded-lg border border-synse-border bg-synse-surface px-3 text-sm text-synse-text"
                defaultValue="M"
              >
                {TAMANHOS.map((tamanho) => (
                  <option key={tamanho} value={tamanho}>
                    {tamanho}
                  </option>
                ))}
              </select>
            }
          />
        )}
      </div>

      {categorias.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-synse-text">Categoria</legend>
          <div className="flex flex-wrap gap-2">
            {categorias.map((categoria, indice) => (
              <label
                key={categoria.id}
                className={cn(
                  'cursor-pointer rounded-xl border border-synse-border bg-synse-surface px-4 py-2 text-sm',
                  'has-[:checked]:border-synse-primary has-[:checked]:bg-synse-primary/10',
                )}
              >
                <input
                  type="radio"
                  name="categoryId"
                  value={categoria.id}
                  defaultChecked={indice === 0}
                  className="sr-only"
                />
                {categoria.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="emergencyName"
          label="Contato de emergência"
          hint="Opcional, e é praxe em prova de rua."
          input={<Input id="emergencyName" name="emergencyName" />}
        />
        <Field
          id="emergencyPhone"
          label="Telefone do contato"
          input={<Input id="emergencyPhone" name="emergencyPhone" type="tel" />}
        />
      </div>

      {/*
        O aceite fica aqui, ao lado do que está sendo coletado, e não escondido
        num rodapé. Quem se inscreve pode nunca ter sido cliente do Synse — é
        a primeira vez que ele guarda o CPF desta pessoa, e a versão aceita
        viaja junto com a inscrição.
      */}
      <div className="rounded-xl border border-synse-border bg-synse-surface-2 p-4">
        <Label className="flex items-start gap-3 text-sm font-normal text-synse-text">
          <input
            type="checkbox"
            name="privacidade"
            className="mt-0.5 size-4 shrink-0 accent-[var(--synse-primary)]"
          />
          <span>
            Autorizo o Synse e a organização do evento a tratarem os dados acima para esta
            inscrição, conforme a{' '}
            <Link href="/privacidade" className="underline" target="_blank">
              Política de Privacidade
            </Link>{' '}
            (versão {versaoDaPolitica}).
          </span>
        </Label>
        {state.fieldErrors?.privacidade && (
          <p className="mt-2 text-xs text-synse-danger">{state.fieldErrors.privacidade[0]}</p>
        )}
      </div>

      <BotaoDeInscricao />
    </form>
  )
}

function BotaoDeInscricao() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? 'Enviando…' : 'Fazer inscrição'}
    </Button>
  )
}
