import type { Metadata } from 'next'
import { BadgeCheck, LogOut } from 'lucide-react'

import { ThemeToggle } from '@/components/synse/theme-toggle'
import { Button } from '@/components/ui/button'
import { AvatarPicker } from '@/features/account/avatar-picker'
import { LinkGymCard } from '@/features/account/link-gym-card'
import { ProfessionalCard } from '@/features/account/professional-card'
import { CloseAccountCard } from '@/features/account/close-account-card'
import { MedalShelf } from '@/features/challenges/medal-shelf'
import { ConsentList } from '@/features/consents/consent-list'
import { signOut } from '@/lib/auth/actions'
import { requireStudentSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { isPendingMigration } from '@/lib/database/pending-migration'
import { formatDate, formatPhone } from '@/lib/utils'
import type { ChallengeMedal } from '@/types/domain'

export const metadata: Metadata = { title: 'Perfil' }

export default async function StudentProfilePage() {
  const session = await requireStudentSession()
  const dataSource = await getDataSource()

  const [student, organization, consents, medals] = await Promise.all([
    dataSource.getStudent(session.organizationId, session.studentId),
    dataSource.getOrganization(session.organizationId),
    /*
     * A lista de consentimentos depende da 0017. Enquanto ela não estiver
     * aplicada, a tela mostra o resto do perfil em vez de quebrar inteira —
     * publicar e migrar são dois atos separados neste projeto.
     */
    dataSource.listConsents(session.userProfileId).catch(() => []),
    dataSource.listChallengeMedals(session.userProfileId).catch((): ChallengeMedal[] => []),
  ])

  /*
   * A URL da foto é assinada e expira: o balde é privado. Pedir aqui, e não no
   * componente, é o que mantém a assinatura no servidor — o cliente nunca vê o
   * caminho no balde, só um endereço temporário.
   *
   * Depende da 0033. Sem ela a tela mostra as iniciais, que é o estado de quem
   * ainda não pôs foto — e não uma tela de erro.
   */
  let fotoAssinada: string | null = null
  try {
    fotoAssinada = await dataSource.getAvatarUrl(student?.avatarUrl ?? null)
  } catch (erro) {
    if (!isPendingMigration(erro)) throw erro
  }

  return (
    <div className="animate-fade-in-up space-y-5">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-synse-text">Perfil</h1>
        <ThemeToggle />
      </header>

      <section className="space-y-4 rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm">
        <AvatarPicker nome={session.name} fotoAtual={fotoAssinada} />
        <div className="min-w-0 border-t border-synse-border pt-4">
          <p className="truncate text-lg font-semibold text-synse-text">{session.name}</p>
          <p className="truncate text-sm text-synse-muted">{session.email}</p>
          <p className="mt-1 font-mono text-xs tracking-wide text-synse-muted">{session.synseId}</p>
        </div>
      </section>

      <MedalShelf medals={medals} />

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

      <ConsentList consents={consents} />

      <CloseAccountCard />

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
