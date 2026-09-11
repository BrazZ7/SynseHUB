import type { Metadata } from 'next'
import { Check, Minus } from 'lucide-react'

import { SynseLogo } from '@/components/synse/synse-logo'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { requireStudentSession } from '@/lib/auth/require-session'
import { TIER_COMPARISON } from '@/lib/plans/tiers'

export const metadata: Metadata = { title: 'Synse+' }

/**
 * O que o plano gratuito já entrega, e o que o Synse+ acrescenta.
 *
 * A página mostra as duas colunas lado a lado, inclusive as linhas em que o
 * gratuito já resolve. Uma lista só de vantagens do pago dá a impressão de que
 * nada funciona sem assinar — e quem chega pela academia não veio comprar
 * nada.
 */
export default async function SynsePlusPage() {
  const session = await requireStudentSession()
  const assinante = session.tier === 'PRO'

  return (
    <div className="animate-fade-in-up space-y-6">
      <section className="relative overflow-hidden rounded-2xl bg-synse-gradient-deep p-6 text-white shadow-synse-lg">
        <div
          aria-hidden
          className="bg-synse-cyan/25 pointer-events-none absolute -right-20 -top-20 size-56 rounded-full blur-3xl"
        />
        <div className="relative space-y-3">
          <SynseLogo tone="light" size="md" />
          <Badge className="bg-white/15 text-white">{assinante ? 'Você é Synse+' : 'Synse+'}</Badge>
          <h1 className="text-2xl font-semibold leading-tight">
            Da inspiração a uma vida extraordinária.
          </h1>
          <p className="text-sm text-white/65">
            Conteúdo, orientação e resultados. Um ecossistema completo para a sua saúde e bem-estar,
            além da academia.
          </p>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-synse-border bg-synse-surface shadow-synse-sm">
        <header className="bg-synse-surface-2/60 grid grid-cols-[1fr_auto_auto] gap-3 border-b border-synse-border px-4 py-3 text-xs font-semibold text-synse-muted">
          <span>Recurso</span>
          <span className="w-20 text-center">Grátis</span>
          <span className="w-20 text-center text-synse-primary">Synse+</span>
        </header>

        <ul className="divide-y divide-synse-border">
          {TIER_COMPARISON.map((feature) => (
            <li key={feature.title} className="px-4 py-3.5">
              <p className="text-sm font-medium text-synse-text">{feature.title}</p>
              <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                <p className="flex items-start gap-1.5 text-xs text-synse-muted">
                  {feature.free ? (
                    <Check className="mt-0.5 size-3.5 shrink-0 text-synse-success" aria-hidden />
                  ) : (
                    <Minus className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  )}
                  <span>
                    <span className="font-medium text-synse-text">Grátis: </span>
                    {feature.free || 'não incluído'}
                  </span>
                </p>
                <p className="flex items-start gap-1.5 text-xs text-synse-muted">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-synse-primary" aria-hidden />
                  <span>
                    <span className="font-medium text-synse-text">Synse+: </span>
                    {feature.pro}
                  </span>
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-synse-border bg-synse-surface p-5 text-center shadow-synse-sm">
        {assinante && (
          <p className="mb-3 text-sm text-synse-success">
            Sua conta já é Synse+. Tudo acima está liberado.
          </p>
        )}
        <p className="text-sm text-synse-muted">A partir de</p>
        <p className="text-3xl font-semibold text-synse-text">
          R$ 29<span className="text-base font-normal text-synse-muted">/mês</span>
        </p>
        <Button variant="gradient" size="lg" className="mt-4 w-full" disabled>
          {assinante ? 'Assinatura ativa' : 'Assinar Synse+'}
        </Button>
        <p className="mt-2 text-xs text-synse-muted">
          A assinatura do consumidor entra na segunda etapa, junto com a integração real de
          pagamento. Ela é separada do plano que a academia paga pelo SynseHub.
        </p>
      </section>
    </div>
  )
}
