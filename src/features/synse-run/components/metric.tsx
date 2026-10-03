import { cn } from '@/lib/utils'

/**
 * Uma métrica: rótulo pequeno, número grande, unidade discreta.
 *
 * A hierarquia é o ponto. Correndo, a pessoa olha a tela por meio segundo com
 * o braço balançando — o que precisa ser lido nesse tempo é o número, e
 * qualquer coisa competindo com ele em peso atrapalha.
 */
export function Metric({
  label,
  value,
  unit,
  size = 'md',
  className,
}: {
  label: string
  value: string
  unit?: string
  size?: 'sm' | 'md' | 'lg' | 'hero'
  className?: string
}) {
  const tamanhos = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-4xl',
    hero: 'text-6xl sm:text-7xl',
  } as const

  return (
    <div className={cn('min-w-0', className)}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-synse-muted">
        {label}
      </p>
      <p className="flex items-baseline gap-1.5">
        <span
          className={cn('font-semibold tabular-nums leading-none text-synse-text', tamanhos[size])}
        >
          {value}
        </span>
        {unit && <span className="text-xs font-medium text-synse-muted">{unit}</span>}
      </p>
    </div>
  )
}

/** Selo de qualidade do sinal. Cor não é o único sinal: o texto também muda. */
export function GpsBadge({ quality }: { quality: 'AUSENTE' | 'FRACO' | 'MEDIO' | 'EXCELENTE' }) {
  const estilos = {
    AUSENTE: { cor: 'bg-synse-muted', texto: 'Procurando GPS' },
    FRACO: { cor: 'bg-synse-danger', texto: 'Sinal fraco' },
    MEDIO: { cor: 'bg-synse-warning', texto: 'Sinal médio' },
    EXCELENTE: { cor: 'bg-synse-success', texto: 'Sinal excelente' },
  } as const

  const { cor, texto } = estilos[quality]

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-synse-surface-2 px-2.5 py-1 text-xs text-synse-text">
      <span className={cn('size-2 rounded-full', cor)} aria-hidden />
      {texto}
    </span>
  )
}
