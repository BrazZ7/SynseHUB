import { CircleCheck, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'

import { Label } from '@/components/ui/label'

/**
 * Campo de formulário com rótulo, dica e erro.
 *
 * Nasceu dentro do formulário de aluno e saiu de lá quando o segundo
 * formulário do painel apareceu. O que importa aqui não é a economia de linhas
 * e sim o `aria-describedby`: erro que só existe visualmente não chega a quem
 * usa leitor de tela, e essa é a parte que se esquece ao copiar e colar.
 */
export function Field({
  id,
  label,
  hint,
  errors,
  input,
}: {
  id: string
  label: string
  hint?: string
  errors?: string[]
  input: ReactNode
}) {
  const errorId = `${id}-error`
  const hintId = `${id}-hint`

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div aria-describedby={[hint && hintId, errors?.length && errorId].filter(Boolean).join(' ')}>
        {input}
      </div>
      {hint && !errors?.length && (
        <p id={hintId} className="text-xs text-synse-muted">
          {hint}
        </p>
      )}
      {errors?.length ? (
        <p id={errorId} role="alert" className="text-xs text-synse-danger">
          {errors[0]}
        </p>
      ) : null}
    </div>
  )
}

/** Resultado da submissão, em `role="status"` para ser anunciado. */
export function Feedback({
  tone,
  message,
  children,
}: {
  tone: 'success' | 'error'
  message: string
  children?: ReactNode
}) {
  const success = tone === 'success'
  const Icon = success ? CircleCheck : TriangleAlert

  return (
    <div
      role="status"
      className={
        success
          ? 'bg-synse-success/10 flex items-start gap-3 rounded-lg p-3.5 text-sm text-synse-success'
          : 'bg-synse-danger/10 flex items-start gap-3 rounded-lg p-3.5 text-sm text-synse-danger'
      }
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="space-y-1">
        <p>{message}</p>
        {children}
      </div>
    </div>
  )
}

/**
 * Aparência do `<select>` nativo.
 *
 * Nativo de propósito: no celular ele abre a roda do próprio sistema, que é
 * mais rápida de operar com uma mão do que qualquer lista construída em
 * JavaScript — e funciona com o teclado sem nada a mais.
 */
export const SELECT_CLASS =
  'focus-visible:ring-synse-primary/25 h-10 w-full rounded-lg border border-synse-border bg-synse-surface px-3 text-sm text-synse-text focus-visible:border-synse-primary focus-visible:outline-none focus-visible:ring-2'
