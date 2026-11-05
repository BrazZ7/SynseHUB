import Image from 'next/image'

import { BRAND } from '@/config/app'
import { cn } from '@/lib/utils'

type SynseLogoProps = {
  /** `full` = símbolo + wordmark. `symbol` = apenas o símbolo. */
  variant?: 'full' | 'symbol'
  /** `dark` para fundos claros, `light` para fundos escuros. */
  tone?: 'dark' | 'light'
  size?: 'sm' | 'md' | 'lg'
  className?: string
  showTagline?: boolean
}

const SIZES = {
  sm: { symbol: 24, text: 'text-lg', tagline: 'text-[9px]' },
  md: { symbol: 32, text: 'text-xl', tagline: 'text-[10px]' },
  lg: { symbol: 44, text: 'text-3xl', tagline: 'text-[11px]' },
} as const

/**
 * Assinatura da marca Synse.
 *
 * O símbolo vem de `/public/brand`; o wordmark é tipografado em runtime para
 * herdar a fonte do produto e permanecer nítido em qualquer densidade.
 */
export function SynseLogo({
  variant = 'full',
  tone = 'dark',
  size = 'md',
  className,
  showTagline = false,
}: SynseLogoProps) {
  const dimensions = SIZES[size]

  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <Image
        src={BRAND.symbol}
        alt=""
        aria-hidden
        width={dimensions.symbol}
        height={dimensions.symbol}
        priority
        className="shrink-0"
      />
      {variant === 'full' && (
        <span className="flex flex-col leading-none">
          <span
            className={cn(
              'font-semibold tracking-tight',
              dimensions.text,
              tone === 'light' ? 'text-white' : 'text-synse-dark dark:text-synse-text',
            )}
          >
            Synse
          </span>
          {showTagline && (
            <span
              className={cn(
                'mt-1 uppercase tracking-[0.22em]',
                dimensions.tagline,
                tone === 'light' ? 'text-white/70' : 'text-synse-muted',
              )}
            >
              Saúde em equilíbrio
            </span>
          )}
        </span>
      )}
      <span className="sr-only">Synse</span>
    </span>
  )
}
