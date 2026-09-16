'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Dumbbell, Footprints, Home, TrendingUp, UserRound } from 'lucide-react'

import { cn } from '@/lib/utils'

/*
 * Cinco destinos, e o do meio é a ação.
 *
 * O SynseRun entra no lugar do Synse+, que era a única aba de venda numa barra
 * de uso diário — quem abre o app para treinar não vem comprar. O Synse+
 * continua a um toque, no cartão da tela inicial.
 */
const ITEMS = [
  { href: '/app', label: 'Hoje', icon: Home },
  { href: '/app/workout', label: 'Treino', icon: Dumbbell },
  { href: '/app/run', label: 'Correr', icon: Footprints, destaque: true },
  { href: '/app/progress', label: 'Progresso', icon: TrendingUp },
  { href: '/app/profile', label: 'Perfil', icon: UserRound },
] as const

/** Navegação principal do Synse App. Fica fixa e respeita a safe area do iOS. */
export function AppBottomNavigation() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Navegação do Synse App"
      className="bg-synse-surface/95 fixed inset-x-0 bottom-0 z-40 border-t border-synse-border pb-[env(safe-area-inset-bottom)] backdrop-blur-lg"
    >
      <ul className="mx-auto flex max-w-lg items-stretch">
        {ITEMS.map((item) => {
          const active = item.href === '/app' ? pathname === '/app' : pathname.startsWith(item.href)
          const Icon = item.icon

          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center gap-1 px-1 py-2.5 text-[10px] font-medium transition-colors duration-200',
                  active ? 'text-synse-primary' : 'text-synse-muted hover:text-synse-text',
                )}
              >
                <Icon
                  className={cn(
                    'size-5 transition-transform duration-200',
                    active && 'scale-110',
                    'destaque' in item &&
                      item.destaque &&
                      'text-synse-primary drop-shadow-[0_0_10px_var(--synse-primary)]',
                  )}
                  aria-hidden
                />
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
