'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { Field, Feedback, SELECT_CLASS } from '@/components/synse/form-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { saveContentAction } from '@/features/content/actions'
import { initialContentState } from '@/features/content/state'
import { TIPOS } from '@/lib/validations/content'
import type { ContentItem } from '@/types/domain'

export function ContentForm({ item }: { item?: ContentItem }) {
  const [state, formAction] = useActionState(saveContentAction, initialContentState)

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {item && <input type="hidden" name="contentId" value={item.id} />}

      {state.status === 'success' && (
        <Feedback tone="success" message={state.message ?? ''}>
          <Button variant="link" size="sm" asChild className="h-auto p-0">
            <Link href="/content">Ver a biblioteca</Link>
          </Button>
        </Feedback>
      )}
      {state.status === 'error' && <Feedback tone="error" message={state.message ?? ''} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[160px_1fr]">
        <Field
          id="type"
          label="Tipo"
          errors={state.fieldErrors?.type}
          input={
            <select id="type" name="type" defaultValue={item?.type ?? 'ARTICLE'} className={SELECT_CLASS}>
              {Object.entries(TIPOS).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
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
              maxLength={140}
              defaultValue={item?.title ?? ''}
              placeholder="Novo horário da musculação aos sábados"
            />
          }
        />
      </div>

      <Field
        id="summary"
        label="Resumo"
        hint="A frase que aparece na lista do aluno."
        errors={state.fieldErrors?.summary}
        input={
          <Input
            id="summary"
            name="summary"
            maxLength={300}
            defaultValue={item?.summary ?? ''}
            placeholder="A partir deste mês abrimos às 8h e fechamos às 14h."
          />
        }
      />

      <Field
        id="body"
        label="Texto"
        hint="Opcional para vídeo, onde o link já é o conteúdo."
        errors={state.fieldErrors?.body}
        input={
          <Textarea id="body" name="body" rows={10} maxLength={20_000} defaultValue={item?.body ?? ''} />
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          id="mediaUrl"
          label="Link do vídeo ou arquivo"
          errors={state.fieldErrors?.mediaUrl}
          input={
            <Input
              id="mediaUrl"
              name="mediaUrl"
              type="url"
              defaultValue={item?.mediaUrl ?? ''}
              placeholder="https://"
            />
          }
        />
        <Field
          id="coverUrl"
          label="Imagem de capa"
          errors={state.fieldErrors?.coverUrl}
          input={
            <Input
              id="coverUrl"
              name="coverUrl"
              type="url"
              defaultValue={item?.coverUrl ?? ''}
              placeholder="https://"
            />
          }
        />
      </div>

      <div className="space-y-4 border-t border-synse-border pt-5">
        <Field
          id="publishAt"
          label="Publicar em"
          hint="Em branco fica como rascunho. Data futura agenda — sai às 6h daquele dia."
          errors={state.fieldErrors?.publishAt}
          input={
            <Input
              id="publishAt"
              name="publishAt"
              type="date"
              defaultValue={item?.publishedAt?.slice(0, 10) ?? ''}
            />
          }
        />

        <div className="flex items-start gap-3 rounded-xl border border-synse-border bg-synse-surface-2 p-4">
          <Switch id="pinned" name="pinned" defaultChecked={item?.pinned ?? false} />
          <div className="space-y-1">
            <label htmlFor="pinned" className="text-sm font-medium text-synse-text">
              Fixar no topo
            </label>
            {/*
              Aviso importante não pode depender de ter sido escrito hoje para
              ser visto.
            */}
            <p className="text-xs text-synse-muted">
              Fica acima dos mais recentes, mesmo depois de semanas.
            </p>
          </div>
        </div>

        {/*
          A visibilidade não é oferecida: conteúdo de academia é da academia.
          "Grátis" é da plataforma, e escolher por engano publicaria na internet.
        */}
        <p className="text-xs text-synse-muted">
          Este conteúdo fica visível apenas para os alunos da sua academia.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-synse-border pt-5">
        <SubmitButton />
        <Button variant="ghost" asChild>
          <Link href="/content">Cancelar</Link>
        </Button>
      </div>
    </form>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Salvando…' : 'Salvar'}
    </Button>
  )
}
