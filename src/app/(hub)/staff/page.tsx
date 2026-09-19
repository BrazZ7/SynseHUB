import type { Metadata } from 'next'
import { UserPlus } from 'lucide-react'

import { DataTable, type Column } from '@/components/synse/data-table'
import { EmptyState } from '@/components/synse/empty-state'
import { PageHeader } from '@/components/synse/page-header'
import { InviteStaffCard } from '@/features/staff/invite-staff-card'
import { PendingInvites } from '@/features/staff/pending-invites'
import { StudentAvatar } from '@/components/synse/student-avatar'
import { Badge } from '@/components/ui/badge'
import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import type { DemoStaff } from '@/lib/database/demo-seed'
import { ROLE_LABELS, can, permissionsForRole } from '@/lib/permissions/permissions'

export const metadata: Metadata = { title: 'Profissionais' }

export default async function StaffPage() {
  const session = await requireHubSession('staff:read')
  const dataSource = await getDataSource()
  const canWrite = can(session.role, 'staff:write')

  const [staff, invites] = await Promise.all([
    dataSource.listStaff(session.organizationId),
    /*
     * A lista de convites depende da 0020. Enquanto ela não estiver aplicada, a
     * página mostra a equipe em vez de quebrar inteira — publicar e migrar são
     * dois atos separados neste projeto.
     */
    canWrite ? dataSource.listStaffInvites(session.organizationId).catch(() => []) : [],
  ])

  const columns: Column<DemoStaff>[] = [
    {
      key: 'name',
      header: 'Profissional',
      render: (member) => (
        <span className="flex items-center gap-3">
          <StudentAvatar name={member.name} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-synse-text">{member.name}</span>
            <span className="block truncate text-xs text-synse-muted">{member.email}</span>
          </span>
        </span>
      ),
    },
    {
      key: 'role',
      header: 'Função',
      render: (member) => <Badge variant="primary">{ROLE_LABELS[member.role]}</Badge>,
    },
    {
      key: 'registration',
      header: 'Registro',
      hideBelow: 'md',
      render: (member) => (
        <span className="text-sm text-synse-muted">{member.registrationNumber ?? '—'}</span>
      ),
    },
    {
      key: 'permissions',
      header: 'Permissões',
      hideBelow: 'lg',
      render: (member) => (
        <span className="text-sm tabular-nums text-synse-muted">
          {permissionsForRole(member.role).length} permissões
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: () => <Badge variant="success">Ativo</Badge>,
    },
  ]

  return (
    <div className="space-y-5 animate-fade-in-up">
      <PageHeader
        title="Profissionais"
        description="Equipe da academia e o que cada função pode acessar. As permissões são aplicadas no servidor e reforçadas pelo banco."
      />

      {canWrite && (
        <section className="rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-synse-text">
            <UserPlus className="size-4 text-synse-muted" aria-hidden />
            Convidar para a equipe
          </h2>
          <p className="mb-4 text-xs text-synse-muted">
            O convite dá acesso ao painel com as permissões da função. Emprestar a sua senha, não —
            ela abre o financeiro e os dados de saúde dos alunos.
          </p>
          <InviteStaffCard />
        </section>
      )}

      {canWrite && <PendingInvites invites={invites} />}

      <DataTable
        caption="Equipe da academia"
        columns={columns}
        rows={staff}
        rowKey={(member) => member.id}
        empty={
          <EmptyState
            title="Nenhum profissional cadastrado."
            description="Convide a equipe para dar acesso ao painel com as permissões da função."
          />
        }
      />
    </div>
  )
}
