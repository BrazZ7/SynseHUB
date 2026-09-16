import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-synse-surface-2 text-synse-muted',
        primary: 'bg-synse-mint/60 text-synse-dark',
        success: 'bg-synse-success/12 text-synse-success',
        warning: 'bg-synse-warning/14 text-synse-warning',
        danger: 'bg-synse-danger/12 text-synse-danger',
        outline: 'border border-synse-border text-synse-muted',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
