import Link from 'next/link'
import { Building2, UserRound } from 'lucide-react'

import { outraPorta, type LadoAtual } from '@/features/auth/portas'
import type { SessionContext } from '@/lib/auth/session'

/**
 * O caminho entre o app e o painel, para quem é as duas coisas.
 *
 * Discreto de propósito: é passagem, não navegação principal. Quem administra a
 * academia e treina nela passa por aqui uma ou duas vezes por dia; quem é só
 * uma das duas coisas nunca vê este elemento, porque a regra
 * (`portas.ts`) devolve nulo.
 */
export function OutraPorta({
  session,
  lado,
}: {
  session: SessionContext
  lado: LadoAtual
}) {
  const porta = outraPorta(session, lado, session.organizationName)
  if (!porta) return null

  const Icone = lado === 'app' ? Building2 : UserRound

  return (
    <Link
      href={porta.href}
      className="inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border border-synse-border bg-synse-surface px-3 text-sm font-medium text-synse-text transition-colors hover:bg-synse-surface-2"
    >
      <Icone className="size-4 text-synse-primary" aria-hidden />
      <span>{porta.rotulo}</span>
      <span className="hidden text-xs text-synse-muted sm:inline">{porta.detalhe}</span>
    </Link>
  )
}
