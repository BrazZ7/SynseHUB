import type { Metadata } from 'next'
import Link from 'next/link'
import { Search, UserPlus, Users } from 'lucide-react'

import { DataTable, type Column } from '@/components/synse/data-table'
import { EmptyState } from '@/components/synse/empty-state'
import { FilterBar } from '@/components/synse/filter-bar'
import { PageHeader } from '@/components/synse/page-header'
import { Pagination } from '@/components/synse/pagination'
import { SearchInput } from '@/components/synse/search-input'
import { StudentStatusBadge } from '@/components/synse/status-badge'
import { StudentAvatar } from '@/components/synse/student-avatar'
import { Button } from '@/components/ui/button'
import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { can } from '@/lib/permissions/permissions'
import type { StudentListItem, StudentFilters } from '@/lib/database/data-source'
import { daysBetween, formatCurrency, formatDate, formatPhone } from '@/lib/utils'
import type { StudentStatus } from '@/types/domain'

export const metadata: Metadata = { title: 'Alunos' }

const PAGE_SIZE = 20

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: 'ALL', label: 'Todos' },
  { value: 'ACTIVE', label: 'Ativos' },
  { value: 'OVERDUE', label: 'Inadimplentes' },
  { value: 'INACTIVE', label: 'Inativos' },
  { value: 'NEW', label: 'Novos' },
  { value: 'DORMANT', label: 'Sem frequência' },
]

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function StudentsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireHubSession('students:read')
  const params = await searchParams
  const dataSource = await getDataSource()

  const statusParam = first(params.status) ?? 'ALL'
  const page = Number(first(params.page) ?? 1) || 1

  const filters: StudentFilters = {
    search: first(params.q),
    planId: first(params.plano),
    trainerId: first(params.professor),
    page,
    pageSize: PAGE_SIZE,
    status: 'ALL',
  }

  if (statusParam === 'NEW') filters.newcomers = true
  else if (statusParam === 'DORMANT') filters.inactiveAttendance = true
  else filters.status = statusParam as StudentStatus | 'ALL'

  const [result, plans, staff] = await Promise.all([
    dataSource.listStudents(session.organizationId, filters),
    dataSource.listPlans(session.organizationId),
    dataSource.listStaff(session.organizationId),
  ])

  const trainers = staff.filter((member) => member.role === 'TRAINER')
  const canWrite = can(session.role, 'students:write')

  const columns: Column<StudentListItem>[] = [
    {
      key: 'name',
      header: 'Aluno',
      render: (student) => (
        <Link
          href={`/students/${student.id}`}
          className="flex items-center gap-3 rounded-md transition-opacity hover:opacity-80"
        >
          <StudentAvatar name={student.name} avatarUrl={student.avatarUrl} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-synse-text">
              {student.name}
            </span>
            <span className="block truncate text-xs text-synse-muted">{student.synseId}</span>
          </span>
        </Link>
      ),
    },
    {
      key: 'phone',
      header: 'Telefone',
      hideBelow: 'xl',
      render: (student) => (
        <span className="text-sm tabular-nums text-synse-muted">{formatPhone(student.phone)}</span>
      ),
    },
    {
      key: 'plan',
      header: 'Plano',
      hideBelow: 'md',
      render: (student) => (
        <span className="text-sm text-synse-text">
          {student.planName ?? <span className="text-synse-muted">Sem plano</span>}
        </span>
      ),
    },
    {
      key: 'trainer',
      header: 'Professor',
      hideBelow: 'xl',
      render: (student) => (
        <span className="text-sm text-synse-muted">{student.trainerName ?? '—'}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (student) => <StudentStatusBadge status={student.status} />,
    },
    {
      key: 'next-charge',
      header: 'Próxima mensalidade',
      hideBelow: 'lg',
      render: (student) =>
        student.nextChargeDueDate ? (
          <span className="text-sm text-synse-text">
            <span className="tabular-nums">{formatDate(student.nextChargeDueDate)}</span>
            {student.nextChargeAmount != null && (
              <span className="ml-1.5 text-xs text-synse-muted">
                {formatCurrency(student.nextChargeAmount)}
              </span>
            )}
          </span>
        ) : (
          <span className="text-sm text-synse-muted">—</span>
        ),
    },
    {
      key: 'attendance',
      header: 'Última presença',
      hideBelow: 'lg',
      render: (student) => <LastAttendance value={student.lastCheckInAt} />,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (student) => (
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/students/${student.id}`}>Abrir</Link>
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-5 animate-fade-in-up">
      <PageHeader
        title="Alunos"
        description="Base completa da academia, com plano, frequência e situação financeira."
        actions={
          canWrite && (
            <Button asChild>
              <Link href="/students/new">
                <UserPlus className="size-4" />
                Novo aluno
              </Link>
            </Button>
          )
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SearchInput placeholder="Buscar por nome, e-mail ou Synse ID" />
        <FilterBar aria-label="Filtrar alunos por situação" paramName="status" options={STATUS_FILTERS} />
      </div>

      {(plans.length > 0 || trainers.length > 0) && (
        <div className="flex flex-wrap gap-2">
          <FilterBar
            aria-label="Filtrar por plano"
            paramName="plano"
            options={[
              { value: 'ALL', label: 'Todos os planos' },
              ...plans.map((plan) => ({ value: plan.id, label: plan.name })),
            ]}
          />
          <FilterBar
            aria-label="Filtrar por professor"
            paramName="professor"
            options={[
              { value: 'ALL', label: 'Todos os professores' },
              ...trainers.map((trainer) => ({ value: trainer.id, label: trainer.name })),
            ]}
          />
        </div>
      )}

      <DataTable
        caption="Lista de alunos da academia"
        columns={columns}
        rows={result.rows}
        rowKey={(student) => student.id}
        empty={
          <EmptyState
            icon={first(params.q) ? Search : Users}
            title={first(params.q) ? 'Nenhum aluno encontrado.' : 'Nenhum aluno cadastrado ainda.'}
            description={
              first(params.q)
                ? 'Tente outro nome, e-mail ou Synse ID.'
                : 'Cadastre o primeiro aluno para começar a acompanhar frequência e mensalidades.'
            }
            action={
              canWrite && (
                <Button asChild>
                  <Link href="/students/new">
                    <UserPlus className="size-4" />
                    Adicionar aluno
                  </Link>
                </Button>
              )
            }
          />
        }
      />

      <Pagination page={result.page} pageSize={result.pageSize} total={result.total} />
    </div>
  )
}

function LastAttendance({ value }: { value: string | null }) {
  if (!value) return <span className="text-sm text-synse-muted">Sem registro</span>

  const days = daysBetween(value)
  const label = days === 0 ? 'Hoje' : days === 1 ? 'Ontem' : `há ${days} dias`

  return (
    <span className={days >= 21 ? 'text-sm text-synse-warning' : 'text-sm text-synse-muted'}>
      {label}
    </span>
  )
}
