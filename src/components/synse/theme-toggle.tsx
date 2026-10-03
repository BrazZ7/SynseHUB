'use client'

import { Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'

import { cn } from '@/lib/utils'

export function ThemeToggle({ className }: { className?: string }) {
  const [dark, setDark] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    setDark(document.documentElement.classList.contains('dark'))
  }, [])

  function toggle() {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    document.documentElement.style.colorScheme = next ? 'dark' : 'light'
    try {
      localStorage.setItem('synse-theme', next ? 'dark' : 'light')
    } catch {
      /* Sem persistência: o tema volta ao padrão do sistema no próximo acesso. */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'Ativar tema claro' : 'Ativar tema escuro'}
      className={cn(
        'inline-flex size-9 items-center justify-center rounded-lg text-synse-muted transition-colors hover:bg-synse-surface-2 hover:text-synse-text',
        className,
      )}
    >
      {mounted && dark ? <Moon className="size-4" /> : <Sun className="size-4" />}
    </button>
  )
}
