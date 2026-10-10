'use client'

import { Globe, Sparkles } from 'lucide-react'
import { useActionState, useState } from 'react'

import { Field, Feedback, SELECT_CLASS } from '@/components/synse/form-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { saveSynseContentAction } from '@/features/content/synse-actions'
import { initialContentState } from '@/features/content/state'
import { TIPOS } from '@/lib/validations/content'
import { cn } from '@/lib/utils'
import type { ContentItem } from '@/types/domain'

/**
 * ── Publicar no acervo Synse ─────────────────────────────────────────────────
 *
 * Quase o formulário de conteúdo da academia, com uma diferença que ocupa o
 * lugar de destaque: **a visibilidade**.
 *
 * Lá ela não é oferecida — conteúdo de academia é da academia, e "grátis" lido
 * como "sem custo para os meus alunos" já publicou na internet o que era para
 * ficar dentro. Aqui quem escolhe é a própria plataforma, e o engano custa o
 * contrário: dar de graça o que sustenta a assinatura.
 *
 * Por isso a escolha não é um `<select>` no meio de outros seis campos. São dois
 * cartões, cada um dizendo em uma frase quem vai ver — e o padrão é o Synse+,
 * porque errar para o lado de trancar se desfaz num clique e errar para o lado
 * de abrir não desfaz quem já baixou.
 */

const OPCOES = [
  {
    valor: 'SYNSE_PLUS' as const,
    rotulo: 'Só assinantes',
    icone: Sparkles,
    frase: 'Quem tem Synse+ vigente. É o acervo que sustenta a assinatura.',
  },
  {
    valor: 'FREE' as const,
    rotulo: 'Aberto a todos',
    icone: Globe,
    frase: 'Qualquer conta do Synse, assinante ou não.',
  },
]

export function SynseContentForm({ item }: { item?: ContentItem }) {
  const [state, formAction] = useActionState(saveSynseContentAction, initialContentState)
  const [visibilidade, setVisibilidade] = useState<'FREE' | 'SYNSE_PLUS'>(
    item?.visibility === 'FREE' ? 'FREE' : 'SYNSE_PLUS',
  )

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {item && <input type="hidden" name="contentId" value={item.id} />}

      {state.status === 'success' && <Feedback tone="success" message={state.message ?? ''} />}
      {state.status === 'error' && <Feedback tone="error" message={state.message ?? ''} />}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-synse-text">Quem vê</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {OPCOES.map(({ valor, rotulo, icone: Icone, frase }) => (
            <label
              key={valor}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors',
                visibilidade === valor
                  ? 'border-synse-primary bg-synse-primary/5'
                  : 'border-synse-border hover:border-synse-primary/40',
              )}
            >
              <input
                type="radio"
                name="visibility"
                value={valor}
                checked={visibilidade === valor}
                onChange={() => setVisibilidade(valor)}
                className="sr-only"
              />
              <Icone
                className={cn(
                  'mt-0.5 size-4 shrink-0',
                  visibilidade === valor ? 'text-synse-primary' : 'text-synse-muted',
                )}
                aria-hidden
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-synse-text">{rotulo}</span>
                <span className="block text-xs text-synse-muted">{frase}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[160px_1fr]">
        <Field
          id="type"
          label="Tipo"
          errors={state.fieldErrors?.type}
          input={
            <select id="type" name="type" defaultValue={item?.type ?? 'EBOOK'} className={SELECT_CLASS}>
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
              placeholder="E-book: hipertrofia sem achismo"
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
            placeholder="Volume, frequência e descanso, com o que a evidência sustenta."
          />
        }
      />

      <Field
        id="body"
        label="Texto"
        hint="Opcional quando o conteúdo é o arquivo ou o vídeo."
        errors={state.fieldErrors?.body}
        input={
          <Textarea id="body" name="body" rows={10} maxLength={20_000} defaultValue={item?.body ?? ''} />
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          id="mediaUrl"
          label="Link do arquivo ou vídeo"
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
          hint="Em branco fica como rascunho. Data futura agenda."
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
            <p className="text-xs text-synse-muted">
              Fica acima dos mais recentes, mesmo depois de semanas.
            </p>
          </div>
        </div>

        {/*
          O alcance dito em voz alta. Conteúdo de academia chega a dezenas de
          pessoas; este chega a todas — e quem publica merece ser lembrado
          disso antes de clicar, não depois.
        */}
        <p className="text-xs text-synse-muted">
          O acervo vale para <strong className="font-medium text-synse-text">toda a base</strong>,
          em qualquer academia e também para quem treina sozinho.
        </p>
      </div>

      <Enviar novo={!item} />
    </form>
  )
}

function Enviar({ novo }: { novo: boolean }) {
  return (
    <Button type="submit" size="lg" className="w-full sm:w-auto">
      {novo ? 'Salvar no acervo' : 'Salvar alterações'}
    </Button>
  )
}
