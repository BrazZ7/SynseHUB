import { cn } from '@/lib/utils'

type ProgressRingProps = {
  /** 0 a 100. */
  value: number
  size?: number
  strokeWidth?: number
  label?: string
  caption?: string
  className?: string
}

/**
 * Indicador circular do Synse App. SVG puro: sem dependência de gráfico,
 * nítido em qualquer densidade e acessível via `role="img"`.
 */
export function ProgressRing({
  value,
  size = 120,
  strokeWidth = 10,
  label,
  caption,
  className,
}: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(100, value))
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (clamped / 100) * circumference
  const gradientId = `synse-ring-${Math.round(size)}-${Math.round(clamped)}`

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${Math.round(clamped)}% concluído`}
        className="-rotate-90"
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00A98F" />
            <stop offset="100%" stopColor="#22C7D8" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--synse-surface-2)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-500 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-semibold text-synse-text">{label ?? `${Math.round(clamped)}%`}</span>
        {caption && <span className="mt-0.5 text-[11px] text-synse-muted">{caption}</span>}
      </div>
    </div>
  )
}
