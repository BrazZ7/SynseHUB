import { Award, Medal, Trophy } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { MedalLevel } from '@/types/domain'

/**
 * A medalha do mês.
 *
 * Existe o nível PARTICIPACAO porque o fim do mês não pode ser silêncio para
 * quem não bateu a meta: quem tentou recebe o registro do que fez. O que se
 * conquista é a distinção entre bronze, prata e ouro — não o direito de ter
 * fechado o mês.
 */
export const MEDAL_LABELS: Record<MedalLevel, string> = {
  OURO: 'Ouro',
  PRATA: 'Prata',
  BRONZE: 'Bronze',
  PARTICIPACAO: 'Participação',
}

const STYLES: Record<MedalLevel, string> = {
  OURO: 'bg-amber-400/15 text-amber-600 dark:text-amber-300',
  PRATA: 'bg-slate-400/15 text-slate-600 dark:text-slate-300',
  BRONZE: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
  PARTICIPACAO: 'bg-synse-surface-2 text-synse-muted',
}

const ICONS: Record<MedalLevel, typeof Medal> = {
  OURO: Trophy,
  PRATA: Medal,
  BRONZE: Medal,
  PARTICIPACAO: Award,
}

export function MedalBadge({ level, size = 'md' }: { level: MedalLevel; size?: 'sm' | 'md' }) {
  const Icon = ICONS[level]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium',
        STYLES[level],
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
      )}
    >
      <Icon className={size === 'sm' ? 'size-3' : 'size-3.5'} aria-hidden />
      {MEDAL_LABELS[level]}
    </span>
  )
}
