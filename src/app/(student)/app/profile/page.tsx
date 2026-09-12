import type { Metadata } from 'next'
import { BadgeCheck, LogOut, ShieldCheck } from 'lucide-react'

import { StudentAvatar } from '@/components/synse/student-avatar'
import { ThemeToggle } from '@/components/synse/theme-toggle'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LinkGymCard } from '@/features/account/link-gym-card'
import { ProfessionalCard } from '@/features/account/professional-card'
import { signOut } from '@/lib/auth/actions'
import { requireStudentSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { formatDate, formatPhone } from '@/lib/utils'

export const metadata: Metadata = { title: 'Perfil' }

export default async function StudentProfilePage() {
  const session = await requireStudentSession()
  const dataSource = await getDataSource()

  const [student, organization] = await Promise.all([
    dataSource.getStudent(session.organizationId, session.studentId),
    dataSource.getOrganization(session.organizationId),
  ])

  return (
    <div className="animate-fade-in-up space-y-5">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-synse-text">Perfil</h1>
        <ThemeToggle />
      </header>

      <section className="flex items-center gap-4 rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm">
        <StudentAvatar name={session.name} size="xl" />
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-synse-text">{session.name}</p>
          <p className="truncate text-sm text-synse-muted">{session.email}</p>
          <p className="mt-1 font-mono text-xs tracking-wide text-synse-muted">{session.synseId}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm">
        <h2 className="mb-3 text-sm font-semibold text-synse-text">Sua conta Synse</h2>
        <div className="space-y-2.5 text-sm">
          <Row
            label="Academia"
            value={session.isSoloStudent ? 'Sem vínculo' : (organization?.name ?? '—')}
          />
          <Row label="Plano" value={student?.planName ?? 'Sem plano'} />
          <Row label="Professor" value={student?.trainerName ?? 'A definir'} />
          <Row label="Matrícula" value={student ? formatDate(student.enrolledAt) : '—'} />
          <Row label="Telefone" value={formatPhone(student?.phone)} />
        </div>

        <p className="bg-synse-mint/40 mt-4 flex items-start gap-2 rounded-lg p-3 text-xs text-synse-dark">
          <BadgeCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Seu Synse ID é vitalício. Se você trocar de academia ou sair, sua conta pessoal continua
          existindo — com seu histórico de treinos e progresso.
        </p>
      </section>

      {/*
        O código de convite só aparece para quem ainda não tem academia. Para
        quem já tem, um segundo campo de código na mesma tela convidaria a
        trocar de academia por engano.
      */}
      {session.isSoloStudent && <LinkGymCard />}

      <ProfessionalCard ativo={session.professionalPlan} defaultName={session.name} />

      <section className="rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-synse-text">
          <ShieldCheck className="size-4 text-synse-muted" aria-hidden />
          Privacidade
        </h2>
        <ul className="space-y-2 text-sm text-synse-muted">
          <li className="flex items-center justify-between gap-3">
            Uso do app e dados cadastrais
            <Badge variant="success">Aceito</Badge>
          </li>
          <li className="flex items-center justify-between gap-3">
            Tratamento de dados de saúde
            <Badge variant="success">Aceito</Badge>
          </li>
          <li className="flex items-center justify-between gap-3">
            Fotos de progresso
            <Badge variant="outline">Não autorizado</Badge>
          </li>
          <li className="flex items-center justify-between gap-3">
            Aparecer em rankings
            <Badge variant="outline">Não autorizado</Badge>
          </li>
        </ul>
        <p className="mt-3 text-xs text-synse-muted">
          Cada consentimento é registrado com versão e data, e pode ser revogado a qualquer momento.
        </p>
      </section>

      <form action={signOut}>
        <Button type="submit" variant="outline" className="w-full">
          <LogOut className="size-4" />
          Sair
        </Button>
      </form>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-synse-muted">{label}</span>
      <span className="truncate text-right font-medium text-synse-text">{value}</span>
    </div>
  )
}
