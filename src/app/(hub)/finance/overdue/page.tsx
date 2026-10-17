import type { Metadata } from 'next'

import { ListLink } from '@/components/synse/list-link'
import { DataTable, type Column } from '@/components/synse/data-table'
import { EmptyState } from '@/components/synse/empty-state'
import { FilterBar } from '@/components/synse/filter-bar'
import { MetricCard } from '@/components/synse/metric-card'
import { BackLink } from '@/components/synse/back-link'
import { PageHeader } from '@/components/synse/page-header'
import { StudentAvatar } from '@/components/synse/student-avatar'
import { Badge } from '@/components/ui/badge'
import { OverdueActionsCell } from '@/features/payments/overdue-actions-cell'
import { Pagination } from '@/components/synse/pagination'
import { estadoDaPaginacao } from '@/components/synse/pagination-state'
import { FAIXAS, OVERDUE_BUCKETS, type OverdueBucket } from '@/features/payments/faixas-de-atraso'
import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import type { ChargeWithStudent } from '@/lib/database/data-source'
import { can } from '@/lib/permissions/permissions'
import { cn, daysOverdue, formatCurrency, formatDate, formatNumber, formatPhone } from '@/lib/utils'

export const metadata: Metadata = { title: 'Inadimplentes' }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

/** Quantas linhas por página. Cabe numa tela sem rolar a tabela inteira. */
const POR_PAGINA = 50

const umTexto = (valor: string | string[] | undefined) => (Array.isArray(valor) ? valor[0] : valor)

export default async function OverduePage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireHubSession('finance:read')
  const params = await searchParams

  const pedida = umTexto(params.faixa) ?? 'ALL'
  const bucket: OverdueBucket | 'ALL' = (FAIXAS as readonly string[]).includes(pedida)
    ? (pedida as OverdueBucket)
    : 'ALL'
  const pagina = Math.max(1, Number(umTexto(params.page) ?? 1) || 1)

  /*
   * ── Os números não são mais somados aqui ──────────────────────────────────
   *
   * Até a 0051 esta tela lia **todas** as cobranças vencidas da academia, sem
   * teto, e somava cinco números em cima da lista. O PostgREST corta a
   * resposta no teto do servidor sem dar erro, e cobrança vencida é o conjunto
   * que mais cresce sem ninguém apagar: todos os cinco vinham menores que a
   * realidade, que é a direção que custa dinheiro.
   *
   * O resumo agora é contado no banco, sobre o conjunto inteiro, e as linhas
   * vêm por página. `hoje` é lido uma vez e vai para as duas consultas: se
   * cada uma usasse o próprio relógio, uma virada de meia-noite entre elas
   * poria uma linha de "6 dias" dentro do filtro de 1 a 5.
   */
  const hoje = new Date()
  const dataSource = await getDataSource()
  const [resumo, lista] = await Promise.all([
    dataSource.getOverdueSummary(session.organizationId, hoje),
    dataSource.listOverdueCharges(session.organizationId, {
      faixa: bucket,
      hoje,
      page: pagina,
      pageSize: POR_PAGINA,
    }),
  ])
  const rows = lista.rows

  const canAct = can(session.role, 'finance:write')

  // Um aluno pode ter mais de uma cobrança em atraso: as duas contagens são
  // grandezas diferentes e o painel precisa dizer qual é qual.
  const studentsInArrears = resumo.alunos
  const totalAmount = resumo.valor
  const averageDays = resumo.cobrancas > 0 ? Math.round(resumo.dias / resumo.cobrancas) : 0
  /* "Acima de 30 dias" é exatamente a última faixa, e não uma segunda régua. */
  const critical = resumo.porFaixa['30+']

  const bucketCounts = OVERDUE_BUCKETS.map((option) => ({
    ...option,
    count: option.value === 'ALL' ? resumo.cobrancas : resumo.porFaixa[option.value],
  }))

  const paginacao = estadoDaPaginacao(pagina, POR_PAGINA, lista.total)

  const columns: Column<ChargeWithStudent>[] = [
    {
      key: 'student',
      header: 'Aluno',
      render: (charge) => (
        <ListLink
          href={`/students/${charge.studentId}`}
          className="flex items-center gap-3 hover:opacity-80"
        >
          <StudentAvatar name={charge.studentName} size="sm" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-synse-text">
              {charge.studentName}
            </span>
            <span className="block truncate text-xs tabular-nums text-synse-muted">
              {formatPhone(charge.studentPhone)}
            </span>
          </span>
        </ListLink>
      ),
    },
    {
      key: 'plan',
      header: 'Mensalidade',
      hideBelow: 'lg',
      render: (charge) => (
        <span className="text-sm text-synse-muted">{charge.planName ?? 'Sem plano'}</span>
      ),
    },
    {
      key: 'amount',
      header: 'Valor',
      render: (charge) => (
        <span className="text-sm font-semibold tabular-nums text-synse-text">
          {formatCurrency(charge.amount)}
        </span>
      ),
    },
    {
      key: 'due',
      header: 'Vencimento',
      hideBelow: 'sm',
      render: (charge) => (
        <span className="text-sm tabular-nums text-synse-muted">{formatDate(charge.dueDate)}</span>
      ),
    },
    {
      key: 'days',
      header: 'Atraso',
      render: (charge) => {
        const days = daysOverdue(charge.dueDate)
        return (
          <Badge
            variant={days > 30 ? 'danger' : days > 15 ? 'warning' : 'outline'}
            className="tabular-nums"
          >
            {days} {days === 1 ? 'dia' : 'dias'}
          </Badge>
        )
      },
    },
    {
      key: 'contact',
      header: 'Último contato',
      hideBelow: 'xl',
      render: () => <span className="text-sm text-synse-muted">Sem registro</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (charge) =>
        canAct ? (
          <OverdueActionsCell
            chargeId={charge.id}
            studentName={charge.studentName}
            amount={charge.amount}
          />
        ) : null,
    },
  ]

  return (
    <div className="animate-fade-in-up space-y-5">
      <BackLink href="/finance" label="Financeiro" />

      <PageHeader
        eyebrow="Synse Pay"
        title="Inadimplentes"
        description="Priorize por tempo de atraso e acione a régua de cobrança sem sair da tela."
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Alunos em atraso"
          value={formatNumber(studentsInArrears)}
          accent="danger"
          hint={`${formatNumber(resumo.cobrancas)} cobranças em aberto`}
        />
        <MetricCard label="Valor em aberto" value={formatCurrency(totalAmount)} accent="warning" />
        <MetricCard label="Atraso médio" value={`${averageDays} dias`} accent="default" />
        <MetricCard
          label="Acima de 30 dias"
          value={formatNumber(critical)}
          accent="danger"
          hint="Cobranças, não alunos"
        />
      </section>

      <FilterBar
        aria-label="Filtrar por faixa de atraso"
        paramName="faixa"
        options={bucketCounts}
      />

      <DataTable
        caption="Cobranças em atraso"
        columns={columns}
        rows={rows}
        rowKey={(charge) => charge.id}
        empty={
          /*
            Vazio por página inexistente não é vazio por ninguém dever: a
            comemoração seria uma mentira para quem só digitou `?page=9` numa
            lista de uma página. O título muda, e o resto — quantos itens a
            lista tem e o botão de voltar — fica com a barra logo abaixo, que
            já diz as duas coisas. Repetir ali em cima seria dizer duas vezes.
          */
          paginacao.tipo === 'fora_da_faixa' ? (
            <EmptyState title="Esta página não existe mais" />
          ) : (
            <EmptyState
              tone="positive"
              title="Nenhuma cobrança em atraso. Excelente!"
              description={
                bucket === 'ALL'
                  ? 'Toda a base está em dia com as mensalidades.'
                  : 'Nenhum aluno nesta faixa de atraso.'
              }
            />
          )
        }
      />

      <Pagination page={pagina} pageSize={POR_PAGINA} total={lista.total} />

      <p className={cn('text-xs text-synse-muted')}>
        A régua automática dispara lembretes 3 dias antes, no vencimento e nos dias 3, 7, 15 e 30 de
        atraso. Configure os canais em Synse Pay → Régua de cobrança.
      </p>
    </div>
  )
}
