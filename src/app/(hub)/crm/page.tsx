import type { Metadata } from 'next'
import Link from 'next/link'
import { CalendarClock, KanbanSquare, Plus, TrendingUp, UserCheck, Users } from 'lucide-react'

import { EmptyState } from '@/components/synse/empty-state'
import { ListLink } from '@/components/synse/list-link'
import { MetricCard } from '@/components/synse/metric-card'
import { PageHeader } from '@/components/synse/page-header'
import { Pagination } from '@/components/synse/pagination'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LeadBoard } from '@/features/crm/lead-board'
import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { can } from '@/lib/permissions/permissions'
import { SOURCE_LABELS, STAGE_LABELS } from '@/lib/validations/lead'
import { formatNumber } from '@/lib/utils'

export const metadata: Metadata = { title: 'CRM' }

/**
 * ── Por que esta tela pagina ────────────────────────────────────────────────
 *
 * Lead entra no CRM e não sai. A página lia **todos** os leads da academia e
 * montava com eles três coisas: os quatro cartões, o funil e a lista "Já
 * decididos". A leitura não tinha teto, e o PostgREST corta a resposta no teto
 * do servidor sem dar erro.
 *
 * O corte caía no pior lugar possível: a ordem põe o retorno mais atrasado
 * primeiro, então o que sobrava na resposta eram justamente os contatos
 * vencidos, e sumia quem ainda estava morno. "Retorno atrasado" acertava por
 * acidente e os outros três erravam.
 *
 * Agora os números vêm contados do banco, o funil pede uma página grande e
 * avisa quando não caber, e "Já decididos" — que é histórico e nunca encolhe —
 * pagina de verdade.
 */

/** O funil é trabalho em aberto: cabe numa tela, e acima disto a tela avisa. */
const NO_FUNIL = 150
const DECIDIDOS_POR_PAGINA = 24

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

export default async function CrmPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireHubSession('crm:read')
  const params = await searchParams
  const dataSource = await getDataSource()

  const paginaParam = Array.isArray(params.page) ? params.page[0] : params.page
  const pagina = Math.max(1, Number(paginaParam ?? 1) || 1)

  const [funil, decididosPagina, resumo, plans] = await Promise.all([
    dataSource.listLeads(session.organizationId, { pageSize: NO_FUNIL }),
    dataSource.listLeads(session.organizationId, {
      decided: true,
      page: pagina,
      pageSize: DECIDIDOS_POR_PAGINA,
    }),
    dataSource.getCrmSummary(session.organizationId),
    dataSource.listPlans(session.organizationId),
  ])

  const canWrite = can(session.role, 'crm:write')

  const abertos = funil.rows
  const { emNegociacao, retornoAtrasado: atrasados, matriculados, perdidos } = resumo

  /*
   * Conversão sobre o que já foi decidido — matriculados mais perdidos —, e não
   * sobre o total. Dividir pelo total afunda a taxa com quem ainda está em
   * negociação, e faria o número melhorar sozinho só por parar de captar.
   */
  const decididos = matriculados + perdidos
  const conversao = decididos > 0 ? Math.round((matriculados / decididos) * 100) : null
  const semNenhum = emNegociacao === 0 && decididos === 0

  return (
    <div className="animate-fade-in-up space-y-5">
      <PageHeader
        title="CRM"
        description="Do primeiro contato à matrícula. Converter é o que cria o aluno e a mensalidade."
        actions={
          canWrite && (
            <Button asChild>
              <Link href="/crm/new">
                <Plus className="size-4" />
                Novo lead
              </Link>
            </Button>
          )
        }
      />

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <MetricCard
          label="Em negociação"
          value={formatNumber(emNegociacao)}
          icon={Users}
          accent="primary"
        />
        <MetricCard
          label="Retorno atrasado"
          value={formatNumber(atrasados)}
          icon={CalendarClock}
          accent={atrasados > 0 ? 'warning' : 'success'}
          hint="Prometido e não feito"
        />
        <MetricCard
          label="Matriculados"
          value={formatNumber(matriculados)}
          icon={UserCheck}
          accent="success"
        />
        <MetricCard
          label="Conversão"
          value={conversao === null ? '—' : `${conversao}%`}
          icon={TrendingUp}
          accent="default"
          hint="Sobre o que já foi decidido"
        />
      </section>

      {semNenhum ? (
        <EmptyState
          icon={KanbanSquare}
          title="Nenhum lead ainda"
          description="Cadastre quem pediu informação na recepção, no Instagram ou no WhatsApp. O funil mostra onde cada pessoa parou."
          action={
            canWrite && (
              <Button asChild>
                <Link href="/crm/new">
                  <Plus className="size-4" />
                  Cadastrar o primeiro
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <>
          <LeadBoard leads={abertos} plans={plans.filter((plano) => plano.status === 'ACTIVE')} />
          {funil.total > abertos.length && (
            /*
             * O funil não pagina: arrastar entre colunas sobre uma página é
             * pior que uma tela cheia. Mas também não mente: se um dia houver
             * mais gente em negociação do que cabe aqui, a tela diz quantos
             * ficaram de fora em vez de cortar em silêncio.
             */
            <p className="px-1 text-xs text-synse-muted">
              Mostrando {formatNumber(abertos.length)} de {formatNumber(funil.total)} em negociação.
              Mover para matriculado ou perdido libera espaço no quadro.
            </p>
          )}
        </>
      )}

      {/*
        ── Os que saíram do quadro ──────────────────────────────────────────
        O funil mostra só quem está em negociação, e estava certo: coluna de
        matriculado e de perdido viraria depósito. O que faltava era **porta**
        — a página dizia "o motivo de cada um fica registrado" e não havia
        onde ler nenhum. Agora cada um abre a própria ficha.
      */}
      {decididos > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-synse-text">Já decididos</h2>
          <p className="text-xs text-synse-muted">
            {formatNumber(matriculados)} {matriculados === 1 ? 'matriculado' : 'matriculados'} e{' '}
            {formatNumber(perdidos)} {perdidos === 1 ? 'perdido' : 'perdidos'}. O motivo de cada
            perda fica no histórico e alimenta a taxa de conversão.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {decididosPagina.rows.map((lead) => (
              <li key={lead.id}>
                {/*
                    `ListLink`, e não `<Link>`: numa lista o `<Link>` busca no
                    servidor toda linha que entra na tela. Guardado por
                    `tests/unit/link-de-lista.test.ts`, que pegou isto aqui.
                  */}
                <ListLink
                  href={`/crm/${lead.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-synse-border bg-synse-surface px-3.5 py-2.5 text-sm transition-colors hover:border-synse-primary"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-synse-text">{lead.name}</span>
                    <span className="block truncate text-xs text-synse-muted">
                      {lead.lostReason ?? SOURCE_LABELS[lead.source]}
                    </span>
                  </span>
                  <Badge variant={lead.stage === 'ENROLLED' ? 'success' : 'warning'}>
                    {STAGE_LABELS[lead.stage]}
                  </Badge>
                </ListLink>
              </li>
            ))}
          </ul>
          <Pagination
            page={decididosPagina.page}
            pageSize={decididosPagina.pageSize}
            total={decididosPagina.total}
          />
        </section>
      )}
    </div>
  )
}
