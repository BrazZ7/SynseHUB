'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CircleHelp, LogOut, Menu, X } from 'lucide-react'
import { useState } from 'react'

import { SynseLogo } from '@/components/synse/synse-logo'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { APP } from '@/config/app'
import { HUB_NAVIGATION, type NavGroup } from '@/config/navigation'
import { ROLE_LABELS } from '@/lib/permissions/permissions'
import { cn, initials } from '@/lib/utils'
import type { UserRole } from '@/types/domain'

type HubSidebarProps = {
  /**
   * Rotas que o papel da sessão pode abrir, decididas no servidor.
   * Só as URLs atravessam o limite RSC — os ícones são componentes e ficam
   * deste lado, importados diretamente da configuração de navegação.
   */
  allowedHrefs: string[]
  user: { name: string; email: string; role: UserRole }
  organizationName: string
  signOutAction: () => Promise<void>
}

export function HubSidebar({
  allowedHrefs,
  user,
  organizationName,
  signOutAction,
}: HubSidebarProps) {
  const [open, setOpen] = useState(false)

  const allowed = new Set(allowedHrefs)
  const navigation: NavGroup[] = HUB_NAVIGATION.map((group) => ({
    ...group,
    items: group.items.filter((item) => allowed.has(item.href)),
  })).filter((group) => group.items.length > 0)

  return (
    <>
      {/*
        Barra de topo mobile.
        Fica `fixed` de propósito: como irmã de um contêiner flex ela ocuparia
        uma coluna e comprimiria o conteúdo. O layout compensa com `pt-16`.
      */}
      <div className="fixed inset-x-0 top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-synse-border bg-synse-surface/90 px-4 backdrop-blur-md lg:hidden">
        <SynseLogo size="sm" />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setOpen(true)}
          aria-label="Abrir menu de navegação"
        >
          <Menu className="size-5" />
        </Button>
      </div>

      {/* Overlay do drawer */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-synse-dark/40 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-synse-gradient-deep transition-transform duration-300 lg:sticky lg:top-0 lg:h-svh lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Navegação principal"
      >
        <div className="flex items-center justify-between px-5 pb-4 pt-5">
          <Link href="/dashboard" className="rounded-lg" onClick={() => setOpen(false)}>
            <SynseLogo tone="light" size="md" />
          </Link>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setOpen(false)}
            aria-label="Fechar menu"
            className="text-white/70 hover:bg-white/10 hover:text-white lg:hidden"
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="mx-4 mb-4 rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 backdrop-blur-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/50">
            Organização
          </p>
          <p className="mt-1 truncate text-sm font-medium text-white">{organizationName}</p>
        </div>

        <nav className="synse-scroll flex-1 overflow-y-auto px-3 pb-4">
          {navigation.map((group) => (
            <div key={group.label} className="mb-5">
              <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <SidebarLink
                      href={item.href}
                      label={item.label}
                      icon={item.icon}
                      soon={item.soon}
                      onNavigate={() => setOpen(false)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/10 px-3 py-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-xs font-semibold text-white">
              {initials(user.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{user.name}</p>
              <p className="truncate text-xs text-white/50">{ROLE_LABELS[user.role]}</p>
            </div>
          </div>

          <div className="mt-1 space-y-0.5">
            <Link
              href="/help"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <CircleHelp className="size-4" />
              Ajuda
            </Link>
            <form action={signOutAction}>
              <button
                type="submit"
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                <LogOut className="size-4" />
                Sair
              </button>
            </form>
          </div>

          <p className="px-3 pb-1 pt-3 text-[10px] text-white/30">
            SynseHub v{APP.version} · {APP.env}
          </p>
        </div>
      </aside>
    </>
  )
}

function SidebarLink({
  href,
  label,
  icon: Icon,
  soon,
  onNavigate,
}: {
  href: string
  label: string
  icon: NavGroup['items'][number]['icon']
  soon?: boolean
  onNavigate: () => void
}) {
  const pathname = usePathname()
  const active = pathname === href || pathname.startsWith(`${href}/`)

  const content = (
    <>
      <Icon
        className={cn(
          'size-4 shrink-0 transition-transform duration-200',
          active ? 'text-synse-primary-light' : 'group-hover:scale-110',
        )}
      />
      <span className="flex-1 truncate">{label}</span>
      {soon && (
        <Badge className="bg-white/10 px-1.5 py-0 text-[9px] font-medium uppercase tracking-wide text-white/50">
          em breve
        </Badge>
      )}
    </>
  )

  const base = 'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200'

  // Módulo ainda sem tela: mostramos o item, mas sem link — assim o Next não
  // faz prefetch de uma rota que não existe.
  if (soon) {
    return (
      <span aria-disabled className={cn(base, 'cursor-default text-white/35')}>
        {content}
      </span>
    )
  }

  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        base,
        active
          ? 'bg-white/15 font-medium text-white shadow-synse-sm'
          : 'text-white/60 hover:bg-white/8 hover:text-white',
      )}
    >
      {content}
    </Link>
  )
}
