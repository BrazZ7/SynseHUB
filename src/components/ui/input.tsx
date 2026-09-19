import * as React from 'react'

import { cn } from '@/lib/utils'

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-lg border border-synse-border bg-synse-surface px-3 py-2 text-sm text-synse-text transition-colors',
        'placeholder:text-synse-muted/70',
        'focus-visible:border-synse-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-synse-primary/25 focus-visible:ring-offset-0',
        'disabled:cursor-not-allowed disabled:opacity-60',
        'file:border-0 file:bg-transparent file:text-sm file:font-medium',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'

export { Input }
