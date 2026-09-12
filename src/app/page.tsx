import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ArrowRight,
  BarChart3,
  CreditCard,
  Dumbbell,
  Heart,
  QrCode,
  Smartphone,
  Sparkles,
  Users,
  Wallet,
} from 'lucide-react'

import { SynseLogo } from '@/components/synse/synse-logo'
import { ThemeToggle } from '@/components/synse/theme-toggle'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { HUB_PLAN_CATALOG } from '@/features/organizations/platform-service'
import { formatCurrency } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'SynseHub — uma nova forma de conectar academia, gestão e saúde',
  description: 'Gestão, pagamentos, treinos, relacionamento e bem-estar em um único ecossistema.',
}

const CAPABILITIES = [
  {
    icon: Users,
    title: 'Gestão completa',
    description:
      'Alunos, planos, matrículas, equipe e permissões por função. Tudo em um lugar, com histórico e auditoria.',
  },
  {
    icon: Wallet,
    title: 'Synse Pay',
    description:
      'Mensalidades automáticas por PIX, cartão e boleto, com split entre a academia e a plataforma.',
  },
  {
    icon: Smartphone,
    title: 'Experiência do aluno',
    description:
      'O Synse App é gratuito para os alunos da academia: treino do dia, progresso, check-in e mensalidade.',
  },
  {
    icon: Dumbbell,
    title: 'Treinos e avaliações',
    description:
      'Divisões A, B, C, biblioteca de exercícios, registro de carga e evolução física acompanhada de perto.',
  },
  {
    icon: CreditCard,
    title: 'Financeiro sob controle',
    description:
      'Régua automática de cobrança, faixas de inadimplência e conciliação confirmada pelo provedor.',
  },
  {
    icon: Sparkles,
    title: 'Synse+',
    description:
      'Programas, receitas, desafios e conteúdo premium que aproximam o aluno da academia todos os dias.',
  },
  {
    icon: BarChart3,
    title: 'Analytics',
    description:
      'Receita, retenção, frequência e previsão de recebimento — números derivados dos dados, não estimados.',
  },
  {
    icon: QrCode,
    title: 'Check-in sem fricção',
    description:
      'QR Code dinâmico no totem, registro na recepção e frequência atualizada em tempo real.',
  },
]

const ECOSYSTEM = [
  { name: 'SynseHub', description: 'Gestão empresarial da academia' },
  { name: 'Synse App', description: 'Aplicativo gratuito do aluno' },
  { name: 'Synse Pay', description: 'Pagamentos e cobranças' },
  { name: 'Synse+', description: 'Assinatura premium do consumidor' },
  { name: 'Synse Pro', description: 'Profissionais autorizados' },
  { name: 'Synse Market', description: 'Marketplace de produtos e serviços' },
]

export default function LandingPage() {
  return (
    <div className="min-h-svh bg-synse-bg">
      {/* Cabeçalho */}
      <header className="bg-synse-bg/85 sticky top-0 z-40 border-b border-synse-border backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
          <SynseLogo size="sm" />
          <nav className="flex items-center gap-2">
            <ThemeToggle />
            {/*
              Duas portas, sempre visíveis. Antes só havia "Entrar", e quem
              chegava sem conta caía numa tela de login para então procurar um
              link pequeno de cadastro — o visitante novo, que é o público da
              página, era o único mal atendido.
            */}
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">Entrar</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/signup">Criar conta</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="bg-synse-primary/12 pointer-events-none absolute -right-40 -top-40 size-[32rem] rounded-full blur-3xl"
          />
          <div
            aria-hidden
            className="bg-synse-cyan/10 pointer-events-none absolute -bottom-52 -left-40 size-[28rem] rounded-full blur-3xl"
          />

          <div className="relative mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
            <div className="max-w-3xl animate-fade-in-up space-y-6">
              <Badge variant="primary" className="gap-1.5">
                <Heart className="size-3" aria-hidden />
                Saúde em equilíbrio com o seu futuro
              </Badge>

              <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight text-synse-text sm:text-5xl lg:text-6xl">
                Uma nova forma de conectar{' '}
                <span className="synse-gradient-text">academia, gestão e saúde</span>.
              </h1>

              <p className="max-w-2xl text-lg leading-relaxed text-synse-muted">
                Gestão, pagamentos, treinos, relacionamento e bem-estar em um único ecossistema.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Button variant="gradient" size="lg" asChild>
                  <Link href="/signup">
                    CRIAR CONTA GRÁTIS
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button variant="outline" size="lg" asChild>
                  <Link href="#recursos">CONHECER SYNSEHUB</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Synse Pay */}
        <section className="mx-auto max-w-6xl px-5 pb-16 sm:px-8">
          <div className="overflow-hidden rounded-3xl bg-synse-gradient-deep p-8 text-white shadow-synse-lg sm:p-12">
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-center">
              <div className="space-y-4">
                <Badge className="bg-white/15 text-white">Synse Pay</Badge>
                <h2 className="text-3xl font-semibold leading-tight sm:text-4xl">
                  Você cuida da academia.
                  <br />
                  <span className="text-synse-primary-light">O Synse cuida das cobranças.</span>
                </h2>
                <p className="max-w-lg text-base leading-relaxed text-white/65">
                  Automatize mensalidades, acompanhe pagamentos e reduza inadimplência em um único
                  lugar.
                </p>
              </div>

              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[
                  'PIX, cartão e boleto',
                  'Split automático',
                  'Régua de cobrança',
                  'Conciliação por webhook',
                  'Previsão de recebimento',
                  'Gestão de inadimplência',
                ].map((item) => (
                  <li
                    key={item}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/85 backdrop-blur-sm"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Recursos */}
        <section id="recursos" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-16 sm:px-8">
          <div className="max-w-2xl space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-synse-primary">
              O que o SynseHub entrega
            </p>
            <h2 className="text-3xl font-semibold tracking-tight text-synse-text">
              Mais que um sistema de gestão. Um ecossistema de saúde.
            </h2>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CAPABILITIES.map((capability) => {
              const Icon = capability.icon
              return (
                <article
                  key={capability.title}
                  className="group rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-synse"
                >
                  <span
                    className="bg-synse-mint/50 flex size-10 items-center justify-center rounded-xl text-synse-primary transition-transform duration-200 group-hover:scale-105"
                    aria-hidden
                  >
                    <Icon className="size-4.5" />
                  </span>
                  <h3 className="mt-4 text-sm font-semibold text-synse-text">{capability.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-synse-muted">
                    {capability.description}
                  </p>
                </article>
              )
            })}
          </div>
        </section>

        {/* Ecossistema */}
        <section className="bg-synse-surface/50 border-y border-synse-border">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
            <div className="max-w-2xl space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-synse-primary">
                Ecossistema Synse
              </p>
              <h2 className="text-3xl font-semibold tracking-tight text-synse-text">
                Produtos diferentes. Uma só plataforma.
              </h2>
              <p className="text-base text-synse-muted">
                Cada produto resolve um problema específico, mas compartilha a mesma identidade, a
                mesma conta e os mesmos dados — com o consentimento do titular.
              </p>
            </div>

            <ul className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {ECOSYSTEM.map((product) => (
                <li
                  key={product.name}
                  className="flex items-center gap-3 rounded-xl border border-synse-border bg-synse-surface px-4 py-3.5"
                >
                  <span className="size-2 shrink-0 rounded-full bg-synse-gradient" aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-synse-text">
                      {product.name}
                    </span>
                    <span className="block truncate text-xs text-synse-muted">
                      {product.description}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Planos */}
        <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
          <div className="max-w-2xl space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-synse-primary">
              Planos SynseHub
            </p>
            <h2 className="text-3xl font-semibold tracking-tight text-synse-text">
              Escolha o tamanho da sua operação.
            </h2>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {HUB_PLAN_CATALOG.map((plan) => (
              <article
                key={plan.tier}
                className={
                  plan.highlight
                    ? 'relative flex flex-col rounded-2xl border-2 border-synse-primary bg-synse-surface p-5 shadow-glow'
                    : 'flex flex-col rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm'
                }
              >
                {plan.highlight && (
                  <Badge variant="primary" className="absolute -top-2.5 left-5">
                    Mais completo
                  </Badge>
                )}

                <h3 className="text-sm font-semibold text-synse-text">{plan.name}</h3>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-synse-text">
                  {plan.price > 0 ? (
                    <>
                      {formatCurrency(plan.price)}
                      <span className="text-sm font-normal text-synse-muted">/mês</span>
                    </>
                  ) : (
                    <span className="text-lg">Sob consulta</span>
                  )}
                </p>

                <ul className="mt-4 flex-1 space-y-2 text-sm text-synse-muted">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <span
                        className="mt-1.5 size-1.5 shrink-0 rounded-full bg-synse-primary"
                        aria-hidden
                      />
                      {feature}
                    </li>
                  ))}
                </ul>

                <Button
                  variant={plan.highlight ? 'gradient' : 'outline'}
                  className="mt-5 w-full"
                  asChild
                >
                  <Link href="/signup">Começar agora</Link>
                </Button>
              </article>
            ))}
          </div>
        </section>

        {/* Fechamento */}
        <section className="mx-auto max-w-6xl px-5 pb-20 sm:px-8">
          <div className="rounded-3xl border border-synse-border bg-synse-surface p-8 text-center shadow-synse-sm sm:p-14">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-synse-primary">
              Disciplina hoje. Liberdade sempre.
            </p>
            <h2 className="mx-auto mt-4 max-w-2xl text-3xl font-semibold leading-tight tracking-tight text-synse-text sm:text-4xl">
              Pequenas escolhas hoje.{' '}
              <span className="synse-gradient-text">Grandes conquistas amanhã.</span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base text-synse-muted">
              Comece pelo SynseHub e leve a sua academia para um ecossistema completo de saúde e
              bem-estar.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <Button variant="gradient" size="lg" asChild>
                <Link href="/signup">
                  CRIAR CONTA GRÁTIS
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button variant="outline" size="lg" asChild>
                <Link href="/login">JÁ TENHO CONTA</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-synse-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 sm:px-8">
          <SynseLogo size="sm" />
          <p className="text-xs text-synse-muted">
            Saúde é a base de tudo · © {new Date().getFullYear()} Synse
          </p>
        </div>
      </footer>
    </div>
  )
}
