import { CalendarDays, Check, Lock, Sparkles } from 'lucide-react'

import { ListLink } from '@/components/synse/list-link'
import { Badge } from '@/components/ui/badge'
import type { ProgramaNaLista } from '@/types/domain'

/**
 * Um programa na lista, com o estado de quem olha.
 *
 * Três situações, e cada uma pede uma frase diferente: nunca começou, está no
 * meio, terminou. "Ver programa" servia para as três e não respondia nenhuma
 * — é o mesmo defeito que a tela do Synse+ já teve com "Você é Synse+".
 */
export function ProgramCard({ programa }: { programa: ProgramaNaLista }) {
  const m = programa.matricula
  const feitos = m?.completedDays.length ?? 0
  const progresso = Math.round((feitos / programa.durationDays) * 100)
  const emAndamento = m?.status === 'ACTIVE'
  const concluido = m?.status === 'COMPLETED'

  return (
    <ListLink
      href={`/app/programs/${programa.id}`}
      className="vidro-led block rounded-2xl border border-synse-border bg-synse-surface p-4 transition-colors hover:border-synse-primary/40"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">
            <CalendarDays className="size-3" aria-hidden />
            {programa.durationDays} dias
          </Badge>
          {programa.visibility === 'SYNSE_PLUS' && (
            <Badge variant="primary">
              <Sparkles className="size-3" aria-hidden />
              Synse+
            </Badge>
          )}
        </div>

        {concluido && (
          <Check className="size-4 shrink-0 text-synse-success" aria-label="Concluído" />
        )}
      </div>

      <h3 className="mt-2 font-semibold text-synse-text">{programa.title}</h3>
      {programa.description && (
        <p className="mt-1 text-sm text-synse-muted">{programa.description}</p>
      )}

      {emAndamento && (
        <div className="mt-3">
          <div
            className="h-1.5 overflow-hidden rounded-full bg-synse-bg"
            role="progressbar"
            aria-valuenow={progresso}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Progresso de ${programa.title}`}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-synse-primary to-synse-primary-light"
              style={{ width: `${progresso}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-synse-muted">
            Dia {m.currentDay} de {programa.durationDays} · {feitos}{' '}
            {feitos === 1 ? 'concluído' : 'concluídos'}
          </p>
        </div>
      )}

      {!m && <p className="mt-3 text-xs font-medium text-synse-primary">Começar este programa</p>}
      {concluido && <p className="mt-3 text-xs text-synse-success">Você terminou este programa.</p>}
      {m?.status === 'ABANDONED' && (
        <p className="mt-3 text-xs text-synse-muted">
          Você saiu deste programa. Dá para recomeçar.
        </p>
      )}
    </ListLink>
  )
}

/**
 * O programa trancado, para quem não assina.
 *
 * Mesma ideia da vitrine do acervo: item invisível não vende. Aqui o anúncio
 * é mais barato — o nome e a duração do programa não são o conteúdo dele, que
 * são os dias.
 */
export function ProgramaTrancado({ titulo, dias }: { titulo: string; dias: number }) {
  return (
    <div className="rounded-2xl border border-dashed border-synse-border bg-synse-surface/60 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">
            <CalendarDays className="size-3" aria-hidden />
            {dias} dias
          </Badge>
          <Badge variant="primary">Synse+</Badge>
        </div>
        <Lock className="size-4 shrink-0 text-synse-muted" aria-label="Programa do Synse+" />
      </div>

      <h3 className="mt-2 font-semibold text-synse-text">{titulo}</h3>
      <p className="mt-1 text-sm text-synse-muted">Os dias deste programa abrem com o Synse+.</p>
    </div>
  )
}
