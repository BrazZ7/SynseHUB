'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'

import { Field, Feedback, SELECT_CLASS } from '@/components/synse/form-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { saveGymChallengeAction } from '@/features/gym-challenges/actions'
import { initialGymChallengeState } from '@/features/gym-challenges/state'
import { METRICAS, type MetricaChave } from '@/lib/validations/gym-challenge'
import type { GymChallenge } from '@/types/domain'

export function GymChallengeForm({ hoje, challenge }: { hoje: string; challenge?: GymChallenge }) {
  const [state, formAction] = useActionState(saveGymChallengeAction, initialGymChallengeState)
  const [metrica, setMetrica] = useState<MetricaChave>(challenge?.metric ?? 'CHECKINS')

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {challenge && <input type="hidden" name="challengeId" value={challenge.id} />}

      {state.status === 'success' && (
        <Feedback tone="success" message={state.message ?? ''}>
          <Button variant="link" size="sm" asChild className="h-auto p-0">
            <Link href="/challenges">Ver os desafios</Link>
          </Button>
        </Feedback>
      )}
      {state.status === 'error' && <Feedback tone="error" message={state.message ?? ''} />}

      <Field
        id="title"
        label="Nome"
        errors={state.fieldErrors?.title}
        input={
          <Input
            id="title"
            name="title"
            required
            maxLength={80}
            defaultValue={challenge?.title ?? ''}
            placeholder="Constância de outubro"
          />
        }
      />

      <Field
        id="description"
        label="Descrição"
        hint="Aparece para o aluno no app."
        errors={state.fieldErrors?.description}
        input={
          <Textarea
            id="description"
            name="description"
            rows={2}
            maxLength={400}
            defaultValue={challenge?.description ?? ''}
          />
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          id="metric"
          label="O que conta"
          hint={METRICAS[metrica].dica}
          errors={state.fieldErrors?.metric}
          input={
            <select
              id="metric"
              name="metric"
              value={metrica}
              onChange={(e) => setMetrica(e.target.value as MetricaChave)}
              className={SELECT_CLASS}
            >
              {Object.entries(METRICAS).map(([chave, { label }]) => (
                <option key={chave} value={chave}>
                  {label}
                </option>
              ))}
            </select>
          }
        />
        <Field
          id="targetValue"
          label={`Meta (${METRICAS[metrica].unidade})`}
          errors={state.fieldErrors?.targetValue}
          input={
            <Input
              id="targetValue"
              name="targetValue"
              type="number"
              min="1"
              required
              defaultValue={challenge?.targetValue ?? ''}
            />
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          id="startsAt"
          label="Começa em"
          errors={state.fieldErrors?.startsAt}
          input={
            <Input
              id="startsAt"
              name="startsAt"
              type="date"
              required
              defaultValue={challenge?.startsAt ?? hoje}
            />
          }
        />
        <Field
          id="endsAt"
          label="Termina em"
          errors={state.fieldErrors?.endsAt}
          input={
            <Input
              id="endsAt"
              name="endsAt"
              type="date"
              required
              defaultValue={challenge?.endsAt ?? ''}
            />
          }
        />
      </div>

      <Field
        id="reward"
        label="Prêmio"
        hint="Opcional. O que ganha quem bater a meta."
        errors={state.fieldErrors?.reward}
        input={
          <Input
            id="reward"
            name="reward"
            maxLength={120}
            defaultValue={challenge?.reward ?? ''}
            placeholder="Camiseta da academia"
          />
        }
      />

      <div className="flex items-start gap-3 rounded-xl border border-synse-border bg-synse-surface-2 p-4">
        <Switch
          id="rankingEnabled"
          name="rankingEnabled"
          defaultChecked={challenge?.rankingEnabled ?? false}
        />
        <div className="space-y-1">
          <label htmlFor="rankingEnabled" className="text-sm font-medium text-synse-text">
            Mostrar ranking
          </label>
          {/*
            A academia liga aqui; cada aluno ainda decide se aparece. Frequência
            e carga dizem onde a pessoa estava e o que o corpo dela aguenta —
            quem não marcar participa do desafio e some do quadro.
          */}
          <p className="text-xs text-synse-muted">
            Mesmo ligado, só aparece no quadro quem consentir no app. O desafio vale para todos de
            qualquer forma.
          </p>
        </div>
      </div>

      <Field
        id="status"
        label="Situação"
        hint="Rascunho não aparece para os alunos."
        errors={state.fieldErrors?.status}
        input={
          <select
            id="status"
            name="status"
            defaultValue={challenge?.status ?? 'ACTIVE'}
            className={SELECT_CLASS}
          >
            <option value="ACTIVE">Publicado</option>
            <option value="DRAFT">Rascunho</option>
            <option value="CLOSED">Encerrado</option>
          </select>
        }
      />

      <div className="flex flex-wrap items-center gap-3 border-t border-synse-border pt-5">
        <SubmitButton editando={Boolean(challenge)} />
        <Button variant="ghost" asChild>
          <Link href="/challenges">Cancelar</Link>
        </Button>
      </div>
    </form>
  )
}

function SubmitButton({ editando }: { editando: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Salvando…' : editando ? 'Salvar desafio' : 'Publicar desafio'}
    </Button>
  )
}
