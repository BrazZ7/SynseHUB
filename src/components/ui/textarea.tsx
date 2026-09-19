import * as React from 'react'

import { cn } from '@/lib/utils'

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-20 w-full rounded-lg border border-synse-border bg-synse-surface px-3 py-2 text-sm text-synse-text',
        'placeholder:text-synse-muted/70',
        'focus-visible:border-synse-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-synse-primary/25',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    />
  ),
)
Textarea.displayName = 'Textarea'

export { Textarea }
