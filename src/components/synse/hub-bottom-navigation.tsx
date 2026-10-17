'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BadgeDollarSign, Gauge, Menu, QrCode, Users } from 'lucide-react'

import { cn } from '@/lib/utils'

/*
 * Os destinos do dia a dia da recepção, e o menu no fim.
 *
 * Não é a navegação inteira: a gaveta continua tendo tudo. É a resposta à
 * pergunta "para onde eu volto?", que no celular não tinha resposta — o painel
 * só oferecia a gaveta pelo topo, e cada tela funda virava um beco sem saída
 * para quem instalou o produto como aplicativo e não tem seta de navegador.
 *
 * A ordem é a do balcão: quem está lá abre check-in o dia inteiro, alunos
 * várias vezes, financeiro algumas, e o painel de manhã.
 */
const ITEMS = [
  { href: '/dashboard', label: 'Painel', icon: Gauge },
  { href: '/students', label: 'Alunos', icon: Users },
  { href: '/checkin', label: 'Check-in', icon: QrCode, destaque: true },
  { href: '/finance', label: 'Financeiro', icon: BadgeDollarSign },
] as const

export function HubBottomNavigation({
  allowedHrefs,
  onOpenMenu,
}: {
  allowedHrefs: string[]
  onOpenMenu: () => void
}) {
  const pathname = usePathname()
  const permitido = new Set(allowedHrefs)
  const itens = ITEMS.filter((item) => permitido.has(item.href))

  return (
    <nav
      aria-label="Navegação do painel"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-synse-border bg-synse-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="flex items-stretch">
        {itens.map((item) => {
          const ativo =
            item.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.href)
          const Icon = item.icon

          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={ativo ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center gap-1 px-1 py-2.5 text-[10px] font-medium transition-colors duration-200',
                  ativo ? 'text-synse-primary' : 'text-synse-muted hover:text-synse-text',
                )}
              >
                <Icon
                  className={cn(
                    'size-5 transition-transform duration-200',
                    ativo && 'scale-110',
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

        {/*
          O menu é botão, não link: ele abre a gaveta que já existe, com a
          navegação completa filtrada por permissão. Duplicar a lista aqui
          criaria duas verdades sobre o que cada função enxerga.
        */}
        <li className="flex-1">
          <button
            type="button"
            onClick={onOpenMenu}
            className="flex w-full flex-col items-center gap-1 px-1 py-2.5 text-[10px] font-medium text-synse-muted transition-colors duration-200 hover:text-synse-text"
          >
            <Menu className="size-5" aria-hidden />
            Menu
          </button>
        </li>
      </ul>
    </nav>
  )
}
