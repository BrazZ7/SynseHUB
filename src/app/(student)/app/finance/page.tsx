import type { Metadata } from 'next'
import { Receipt, Wallet } from 'lucide-react'

import { EmptyState } from '@/components/synse/empty-state'
import { PaymentStatus } from '@/components/synse/status-badge'
import { StudentPixPanel } from '@/features/payments/student-pix-panel'
import { requireStudentSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { getPaymentProvider } from '@/lib/payments'
import { formatCurrency, formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Financeiro' }

export default async function StudentFinancePage() {
  const session = await requireStudentSession()
  const dataSource = await getDataSource()

  const [student, charges] = await Promise.all([
    dataSource.getStudent(session.organizationId, session.studentId),
    dataSource.getChargesForStudent(session.organizationId, session.studentId),
  ])

  const openCharge =
    charges
      .filter((charge) => charge.status === 'PENDING' || charge.status === 'OVERDUE')
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] ?? null

  const history = charges.filter((charge) => charge.status === 'PAID').slice(0, 12)
  const provider = getPaymentProvider()
  const pixSupported = provider.supportedMethods.includes('PIX')

  return (
    <div className="space-y-5 animate-fade-in-up">
      <header>
        <h1 className="text-2xl font-semibold text-synse-text">Financeiro</h1>
        <p className="text-sm text-synse-muted">Seu plano, vencimentos e histórico de pagamentos.</p>
      </header>

      <section className="rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-synse-primary">
          Plano atual
        </p>
        <p className="mt-1.5 text-lg font-semibold text-synse-text">
          {student?.planName ?? 'Sem plano ativo'}
        </p>
        {student?.planPrice != null && (
          <p className="text-sm text-synse-muted">
            {formatCurrency(student.planPrice)} por mês
          </p>
        )}
      </section>

      {openCharge ? (
        <StudentPixPanel
          chargeId={openCharge.id}
          amount={openCharge.amount}
          dueDate={openCharge.dueDate}
          description={openCharge.description}
          status={openCharge.status}
          pixSupported={pixSupported}
        />
      ) : (
        <EmptyState
          tone="positive"
          icon={Wallet}
          title="Tudo em dia"
          description="Você não tem nenhuma mensalidade em aberto."
          className="rounded-2xl border border-synse-border bg-synse-surface"
        />
      )}

      <section className="rounded-2xl border border-synse-border bg-synse-surface shadow-synse-sm">
        <h2 className="border-b border-synse-border px-5 py-4 text-sm font-semibold text-synse-text">
          Histórico
        </h2>
        {history.length === 0 ? (
          <EmptyState icon={Receipt} title="Nenhum pagamento ainda" className="py-8" />
        ) : (
          <ul className="divide-y divide-synse-border">
            {history.map((charge) => (
              <li key={charge.id} className="flex items-center gap-3 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium capitalize text-synse-text">
                    {charge.description}
                  </p>
                  <p className="text-xs text-synse-muted">
                    Pago em {formatDate(charge.paidAt)}
                  </p>
                </div>
                <span className="text-sm font-semibold tabular-nums text-synse-text">
                  {formatCurrency(charge.amount)}
                </span>
                <PaymentStatus status={charge.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
