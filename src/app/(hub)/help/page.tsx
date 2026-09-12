import type { Metadata } from 'next'
import Link from 'next/link'
import { BookOpen, LifeBuoy, Mail, ShieldCheck } from 'lucide-react'

import { PageHeader } from '@/components/synse/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { APP } from '@/config/app'
import { requireHubSession } from '@/lib/auth/require-session'
import { isDemoMode } from '@/lib/database/env'
import { getPaymentProvider } from '@/lib/payments'

export const metadata: Metadata = { title: 'Ajuda' }

export default async function HelpPage() {
  const session = await requireHubSession()
  const provider = getPaymentProvider()

  return (
    <div className="mx-auto max-w-3xl space-y-5 animate-fade-in-up">
      <PageHeader
        title="Ajuda"
        description="Como o SynseHub está configurado neste ambiente e onde encontrar apoio."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LifeBuoy className="size-4 text-synse-muted" aria-hidden />
            Este ambiente
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2.5 text-sm">
          <Row label="Versão" value={`SynseHub ${APP.version}`} />
          <Row label="Ambiente" value={APP.env} />
          <Row label="Banco de dados" value={isDemoMode() ? 'Demonstração (em memória)' : 'Supabase'} />
          <Row label="Provedor de pagamentos" value={provider.id} />
          <Row label="Seu perfil" value={session.role} />
          <Row label="Organização" value={session.organizationName} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="size-4 text-synse-muted" aria-hidden />
            Primeiros passos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-2.5 text-sm text-synse-muted">
            {[
              ['Cadastre os planos', '/plans'],
              ['Convide a equipe', '/staff'],
              ['Matricule os alunos', '/students/new'],
              ['Conecte o Synse Pay', '/synse-pay'],
              ['Ative o check-in por QR Code', '/checkin'],
            ].map(([label, href], index) => (
              <li key={href} className="flex items-center gap-3">
                <span
                  className="flex size-6 shrink-0 items-center justify-center rounded-full bg-synse-mint/50 text-xs font-semibold text-synse-dark"
                  aria-hidden
                >
                  {index + 1}
                </span>
                <span className="flex-1">{label}</span>
                <Button variant="link" size="sm" asChild className="h-auto p-0">
                  <Link href={href}>Abrir</Link>
                </Button>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-synse-muted" aria-hidden />
            Privacidade e segurança
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-synse-muted">
          <p>
            Cada academia é uma organização isolada. Nenhum dado privado atravessa organizações —
            a separação é garantida pelo banco, não apenas pela aplicação.
          </p>
          <p>
            Dados de cartão nunca trafegam pelos nossos servidores. O pagamento só muda de status
            quando o provedor confirma.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="size-4 text-synse-muted" aria-hidden />
            Falar com a Synse
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-synse-muted">
          <p>
            Suporte pelo e-mail{' '}
            <a href="mailto:suporte@synse.com.br" className="text-synse-primary hover:underline">
              suporte@synse.com.br
            </a>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-synse-border pb-2.5 last:border-0 last:pb-0">
      <span className="text-synse-muted">{label}</span>
      <span className="font-medium text-synse-text">{value}</span>
    </div>
  )
}
