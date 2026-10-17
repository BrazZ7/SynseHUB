import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  CalendarClock,
  CircleUserRound,
  History,
  Mail,
  MessageSquare,
  Phone,
  Pencil,
  UserCheck,
} from 'lucide-react'

import { BackLink } from '@/components/synse/back-link'
import { EmptyState } from '@/components/synse/empty-state'
import { PageHeader } from '@/components/synse/page-header'
import { StudentAvatar } from '@/components/synse/student-avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AvancarEtapa, Converter, Perder, Registrar } from '@/features/crm/lead-actions'
import { eventosPorDia, PROXIMA, tituloDoEvento } from '@/features/crm/state'
import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { can } from '@/lib/permissions/permissions'
import { seAindaNaoMigrou } from '@/lib/database/pending-migration'
import { SOURCE_LABELS, STAGE_LABELS } from '@/lib/validations/lead'
import { cn, formatDate, formatDateTime, formatPhone } from '@/lib/utils'
import type { LeadEventKind, LeadStage } from '@/types/domain'

/**
 * ── A ficha do lead ─────────────────────────────────────────────────────────
 *
 * O CRM tinha quadro e cadastro, e não tinha ficha. `listLeadEvents` estava no
 * data source desde a 0028, o gatilho gravava cada mudança de etapa, cada
 * ligação registrada ia para `lead_events` — e **nenhuma tela lia**. A recepção
 * anotava "liguei, pediu para retornar na quinta", via "Registrado no
 * histórico", e não tinha onde ver o histórico.
 *
 * Pior num CRM que em qualquer outro módulo: o valor de um funil não é saber
 * em que etapa a pessoa está, é saber o que já foi tentado com ela. Sem isso,
 * duas pessoas da recepção ligam no mesmo dia, e ninguém sabe por que o lead
 * parou na proposta há três semanas.
 *
 * ── Por que a ficha, e não só o cartão ──────────────────────────────────────
 *
 * O cartão do quadro resolve o passo seguinte sem sair da tela, que é o que a
 * recepção faz o dia inteiro. O que ele não tem é espaço para o histórico — e
 * o quadro também não mostra matriculados nem perdidos, que são justamente os
 * que alguém vai querer reler depois para entender a conversão.
 */

type Params = Promise<{ id: string }>

const ICONE: Record<LeadEventKind, typeof Phone> = {
  CREATED: CircleUserRound,
  STAGE_CHANGE: History,
  CALL: Phone,
  MESSAGE: MessageSquare,
  VISIT: UserCheck,
  NOTE: Pencil,
}

/** Matriculado é bom, perdido é fim de linha, o resto está em andamento. */
const TOM: Partial<Record<LeadStage, 'success' | 'warning'>> = {
  ENROLLED: 'success',
  LOST: 'warning',
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params
  const session = await requireHubSession('crm:read')
  const dataSource = await getDataSource()
  const lead = await dataSource.getLead(session.organizationId, id)
  return { title: lead ? `${lead.name} · CRM` : 'CRM' }
}

export default async function LeadPage({ params }: { params: Params }) {
  const { id } = await params
  const session = await requireHubSession('crm:read')
  const dataSource = await getDataSource()

  /*
   * `getLead` já recebe a academia da sessão, e a RLS (`leads_staff`, 0028)
   * confere de novo: um id de outra academia colado na barra de endereços cai
   * aqui como "não encontrado", que é o que ele deve ser.
   */
  const lead = await dataSource.getLead(session.organizationId, id)
  if (!lead) notFound()

  const [eventos, plans] = await Promise.all([
    dataSource.listLeadEvents(session.organizationId, lead.id).catch(seAindaNaoMigrou([])),
    dataSource.listPlans(session.organizationId),
  ])

  const canWrite = can(session.role, 'crm:write')
  const proxima = PROXIMA[lead.stage]
  /*
   * Matriculado e perdido não têm retorno pendente. A data continua gravada —
   * `moveLeadStage` não a limpa, e limpar seria apagar o que estava combinado
   * —, mas mostrá-la numa ficha encerrada diz "ligue para esta pessoa hoje"
   * sobre alguém que já fechou ou já desistiu.
   */
  const emNegociacao = lead.stage !== 'ENROLLED' && lead.stage !== 'LOST'
  const vencido = lead.nextFollowUpAt && new Date(lead.nextFollowUpAt) < new Date()
  const dias = eventosPorDia(eventos)

  return (
    <div className="animate-fade-in-up space-y-5">
      <BackLink href="/crm" label="CRM" />

      <PageHeader
        eyebrow={SOURCE_LABELS[lead.source]}
        title={lead.name}
        description={lead.notes ?? undefined}
        actions={
          canWrite && (
            <Button asChild variant="outline">
              <Link href={`/crm/${lead.id}/edit`}>
                <Pencil className="size-4" aria-hidden />
                Editar dados
              </Link>
            </Button>
          )
        }
      />

      <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-synse-border bg-synse-surface p-4 shadow-synse-sm">
        <StudentAvatar name={lead.name} size="lg" />

        <dl className="flex min-w-0 flex-1 flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-synse-muted">
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Etapa</dt>
            <dd>
              <Badge variant={TOM[lead.stage] ?? 'default'}>{STAGE_LABELS[lead.stage]}</Badge>
            </dd>
          </div>
          {lead.phone && (
            <div className="flex items-center gap-1.5">
              <dt>
                <Phone className="size-4" aria-hidden />
                <span className="sr-only">Telefone</span>
              </dt>
              <dd className="text-synse-text">{formatPhone(lead.phone)}</dd>
            </div>
          )}
          {lead.email && (
            <div className="flex items-center gap-1.5">
              <dt>
                <Mail className="size-4" aria-hidden />
                <span className="sr-only">E-mail</span>
              </dt>
              <dd className="truncate text-synse-text">{lead.email}</dd>
            </div>
          )}
          {lead.ownerName && (
            <div className="flex items-center gap-1.5">
              <dt>
                <CircleUserRound className="size-4" aria-hidden />
                <span className="sr-only">Responsável</span>
              </dt>
              <dd className="text-synse-text">{lead.ownerName}</dd>
            </div>
          )}
          {emNegociacao && lead.nextFollowUpAt && (
            <div
              className={cn(
                'flex items-center gap-1.5',
                vencido && 'font-medium text-synse-warning',
              )}
            >
              <dt>
                <CalendarClock className="size-4" aria-hidden />
                <span className="sr-only">Retorno</span>
              </dt>
              <dd>
                {vencido ? 'Atrasado desde ' : 'Retornar em '}
                {formatDate(lead.nextFollowUpAt)}
              </dd>
            </div>
          )}
        </dl>
      </section>

      {lead.convertedStudentId && (
        <Link
          href={`/students/${lead.convertedStudentId}`}
          className="flex items-center gap-2 rounded-xl bg-synse-success/10 p-3.5 text-sm text-synse-success transition-opacity hover:opacity-80"
        >
          <UserCheck className="size-4 shrink-0" aria-hidden />
          Virou aluno. Abrir a ficha de matrícula.
        </Link>
      )}

      {lead.lostReason && (
        <p className="rounded-xl border border-synse-warning/40 bg-synse-warning/5 p-3.5 text-sm text-synse-text">
          <span className="font-medium">Motivo da perda:</span> {lead.lostReason}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        {/* ── O histórico ── */}
        <Card>
          <CardHeader>
            <CardTitle>Histórico</CardTitle>
          </CardHeader>
          <CardContent>
            {dias.length === 0 ? (
              <EmptyState
                icon={History}
                title="Nada registrado ainda"
                description="Cada ligação, mensagem e mudança de etapa entra aqui, com data e autor."
              />
            ) : (
              <ol className="space-y-5">
                {dias.map(({ dia, eventos }) => (
                  <li key={dia}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-synse-muted">
                      {formatDate(`${dia}T12:00:00`)}
                    </p>
                    <ul className="space-y-3 border-l border-synse-border pl-4">
                      {eventos.map((evento) => {
                        const Icone = ICONE[evento.kind]
                        return (
                          <li key={evento.id} className="relative">
                            <span
                              className="absolute -left-[22px] top-0.5 flex size-4 items-center justify-center rounded-full bg-synse-surface-2"
                              aria-hidden
                            >
                              <Icone className="size-2.5 text-synse-primary" />
                            </span>
                            <p className="text-sm font-medium text-synse-text">
                              {tituloDoEvento(evento, (etapa) => STAGE_LABELS[etapa])}
                            </p>
                            {evento.body && (
                              <p className="mt-0.5 text-sm text-synse-muted">{evento.body}</p>
                            )}
                            <p className="mt-0.5 text-xs text-synse-muted">
                              {formatDateTime(evento.createdAt)}
                              {evento.actorName && ` · ${evento.actorName}`}
                            </p>
                          </li>
                        )
                      })}
                    </ul>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        {/* ── O que fazer agora ── */}
        {canWrite && (
          <aside className="space-y-3 self-start rounded-2xl border border-synse-border bg-synse-surface p-4 shadow-synse-sm">
            <h2 className="text-sm font-semibold text-synse-text">Próximo passo</h2>
            {proxima && <AvancarEtapa leadId={lead.id} proxima={proxima} />}
            <Registrar leadId={lead.id} />
            <Converter lead={lead} plans={plans.filter((p) => p.status === 'ACTIVE')} />
            {lead.stage !== 'LOST' && <Perder leadId={lead.id} />}
          </aside>
        )}
      </div>
    </div>
  )
}
