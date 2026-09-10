import type { Metadata } from 'next'
import { BookOpen, Dumbbell, HeartPulse, Salad, Sparkles, Trophy } from 'lucide-react'

import { SynseLogo } from '@/components/synse/synse-logo'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = { title: 'Synse+' }

const BENEFITS = [
  { icon: BookOpen, title: 'Biblioteca premium', description: 'E-books e guias práticos sobre alimentação, treino e hábitos.' },
  { icon: Dumbbell, title: 'Programas guiados', description: 'Synse 21, 30, 60 e 90 — jornadas com tarefas, hábitos e conteúdo.' },
  { icon: Salad, title: 'Receitas Synse', description: 'Cardápios rápidos, econômicos, proteicos e vegetarianos.' },
  { icon: Trophy, title: 'Desafios', description: 'Hidratação, passos e frequência, com ranking opcional.' },
  { icon: HeartPulse, title: 'Relatórios avançados', description: 'Evolução detalhada de carga, medidas e frequência.' },
  { icon: Sparkles, title: 'Benefícios com parceiros', description: 'Vantagens exclusivas na rede de parceiros Synse.' },
]

export default function SynsePlusPage() {
  return (
    <div className="space-y-6 animate-fade-in-up">
      <section className="relative overflow-hidden rounded-2xl bg-synse-gradient-deep p-6 text-white shadow-synse-lg">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-20 size-56 rounded-full bg-synse-cyan/25 blur-3xl"
        />
        <div className="relative space-y-3">
          <SynseLogo tone="light" size="md" />
          <Badge className="bg-white/15 text-white">Synse+</Badge>
          <h1 className="text-2xl font-semibold leading-tight">
            Da inspiração a uma vida extraordinária.
          </h1>
          <p className="text-sm text-white/65">
            Conteúdo, orientação e resultados. Um ecossistema completo para a sua saúde e bem-estar,
            além da academia.
          </p>
        </div>
      </section>

      <ul className="space-y-2.5">
        {BENEFITS.map((benefit) => {
          const Icon = benefit.icon
          return (
            <li
              key={benefit.title}
              className="flex gap-3.5 rounded-2xl border border-synse-border bg-synse-surface p-4 shadow-synse-sm"
            >
              <span
                className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-synse-mint/50 text-synse-primary"
                aria-hidden
              >
                <Icon className="size-4.5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-synse-text">{benefit.title}</p>
                <p className="text-xs text-synse-muted">{benefit.description}</p>
              </div>
            </li>
          )
        })}
      </ul>

      <section className="rounded-2xl border border-synse-border bg-synse-surface p-5 text-center shadow-synse-sm">
        <p className="text-sm text-synse-muted">A partir de</p>
        <p className="text-3xl font-semibold text-synse-text">
          R$ 29<span className="text-base font-normal text-synse-muted">/mês</span>
        </p>
        <Button variant="gradient" size="lg" className="mt-4 w-full" disabled>
          Assinar Synse+
        </Button>
        <p className="mt-2 text-xs text-synse-muted">
          A assinatura do consumidor entra na segunda etapa, junto com a integração real de
          pagamento. Ela é separada do plano que a academia paga pelo SynseHub.
        </p>
      </section>
    </div>
  )
}
