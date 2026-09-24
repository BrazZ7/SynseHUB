import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight, Lock, Timer } from 'lucide-react'

import { ListLink } from '@/components/synse/list-link'
import { BackLink } from '@/components/synse/back-link'
import { EmptyState } from '@/components/synse/empty-state'
import { Badge } from '@/components/ui/badge'
import { Metric } from '@/features/synse-run/components/metric'
import {
  formatDistance,
  formatDuration,
  formatPace,
  SPORT_LABELS,
} from '@/features/synse-run/format'
import { requireStudentSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { isPendingMigration } from '@/lib/database/pending-migration'
import { janelaBloqueada, recortarDias } from '@/lib/plans/history'
import { HISTORY_MONTHS } from '@/lib/plans/tiers'
import type { Activity } from '@/types/domain'

export const metadata: Metadata = { title: 'Minhas atividades' }

/**
 * "3 meses" entrou junto com o limite de plano.
 *
 * Sem ela, o gratuito pedia "Tudo", o servidor recortava para noventa dias, e
 * nenhum filtro ficava marcado — a tela mostrava um recorte que ela mesma não
 * sabia nomear. O teto do plano precisa existir como opção para poder ser o
 * estado em vigor.
 */
const PERIODOS = {
  semana: { label: 'Semana', dias: 7 },
  mes: { label: 'Mês', dias: 30 },
  trimestre: { label: '3 meses', dias: 90 },
  ano: { label: 'Ano', dias: 365 },
  tudo: { label: 'Tudo', dias: 0 },
} as const

/** A maior janela que o plano gratuito cobre. */
const PERIODO_DO_GRATUITO = 'trimestre' as const

type Periodo = keyof typeof PERIODOS

export default async function RunHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; esporte?: string }>
}) {
  const session = await requireStudentSession()
  const filtros = await searchParams

  const periodo = (
    Object.keys(PERIODOS).includes(filtros.periodo ?? '') ? filtros.periodo : 'mes'
  ) as Periodo
  const esporte =
    filtros.esporte === 'RUN' || filtros.esporte === 'WALK' || filtros.esporte === 'RIDE'
      ? filtros.esporte
      : undefined

  /*
   * O recorte do plano acontece aqui, no servidor. O filtro acima esconde a
   * janela que o plano não cobre; forjar `?periodo=tudo` passa por cima dele, e
   * não passa por aqui — a regra da casa é que o front-end só esconde UI.
   */
  const recortado = janelaBloqueada(session.tier, PERIODOS[periodo].dias)
  /*
   * O período **em vigor**, que não é sempre o pedido. Marcar o pedido deixaria
   * um filtro trancado aceso; não marcar nada deixaria a tela sem dizer o que
   * está mostrando. Marca-se o que de fato foi aplicado.
   */
  const emVigor: Periodo = recortado ? PERIODO_DO_GRATUITO : periodo
  const dias = recortarDias(session.tier, PERIODOS[emVigor].dias)
  const desde = dias > 0 ? new Date(Date.now() - dias * 86_400_000).toISOString() : undefined

  let atividades: Activity[] = []
  let indisponivel = false

  try {
    const dataSource = await getDataSource()
    atividades = await dataSource.listActivities(session.userProfileId, {
      sport: esporte,
      since: desde,
      limit: 100,
    })
  } catch (error) {
    if (!isPendingMigration(error)) throw error
    indisponivel = true
  }

  const total = atividades.reduce(
    (soma, atividade) => ({
      distancia: soma.distancia + atividade.distanceMeters,
      tempo: soma.tempo + atividade.movingSeconds,
    }),
    { distancia: 0, tempo: 0 },
  )

  return (
    <div className="animate-fade-in-up space-y-5">
      <header>
        <BackLink href="/app/run" label="SynseRun" />
        <h1 className="text-2xl font-semibold text-synse-text">Minhas atividades</h1>
      </header>

      {recortado && (
        <Link
          href="/app/synse"
          className="flex items-start gap-2.5 rounded-xl border border-synse-border bg-synse-surface p-4 text-sm text-synse-text transition-colors hover:border-synse-primary"
        >
          <Lock className="mt-0.5 size-4 shrink-0 text-synse-primary" aria-hidden />
          <span>
            No plano gratuito o histórico volta {HISTORY_MONTHS.FREE} meses. O Synse+ abre{' '}
            {HISTORY_MONTHS.PRO / 12} anos — e nada é apagado: suas atividades continuam aqui.
          </span>
        </Link>
      )}

      {/* Filtros: link, não botão — o estado vive na URL e sobrevive ao recarregar */}
      <nav className="flex flex-wrap gap-2" aria-label="Filtrar atividades">
        {Object.entries(PERIODOS).map(([chave, { label, dias: diasDaOpcao }]) => {
          const trancada = janelaBloqueada(session.tier, diasDaOpcao)

          return (
            <Link
              key={chave}
              href={
                trancada
                  ? '/app/synse'
                  : `/app/run/history?periodo=${chave}${esporte ? `&esporte=${esporte}` : ''}`
              }
              className="rounded-full px-1"
              aria-current={chave === emVigor ? 'page' : undefined}
              aria-label={trancada ? `${label} — disponível no Synse+` : undefined}
            >
              <Badge variant={chave === emVigor ? 'primary' : 'outline'}>
                {trancada && <Lock className="mr-1 size-3" aria-hidden />}
                {label}
              </Badge>
            </Link>
          )
        })}

        {(['RUN', 'WALK', 'RIDE'] as const).map((tipo) => (
          <Link
            key={tipo}
            href={`/app/run/history?periodo=${periodo}${esporte === tipo ? '' : `&esporte=${tipo}`}`}
            className="rounded-full px-1"
          >
            <Badge variant={esporte === tipo ? 'primary' : 'outline'}>{SPORT_LABELS[tipo]}</Badge>
          </Link>
        ))}
      </nav>

      {atividades.length > 0 && (
        <section className="grid grid-cols-3 gap-3 rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm">
          <Metric label="Atividades" value={String(atividades.length)} size="sm" />
          <Metric
            label="Distância"
            value={formatDistance(total.distancia, 1)}
            unit="km"
            size="sm"
          />
          <Metric label="Tempo" value={formatDuration(total.tempo)} size="sm" />
        </section>
      )}

      {indisponivel ? (
        <p className="rounded-xl bg-synse-surface-2 p-4 text-sm text-synse-muted">
          O histórico está sendo liberado nesta conta.
        </p>
      ) : atividades.length === 0 ? (
        <EmptyState
          icon={Timer}
          title="Nenhuma atividade neste período"
          description="Quando você correr, caminhar ou pedalar com o SynseRun, tudo aparece aqui."
        />
      ) : (
        <ul className="space-y-2">
          {atividades.map((atividade) => (
            <li key={atividade.id}>
              <ListLink
                href={`/app/run/${atividade.id}`}
                className="flex items-center gap-3 rounded-2xl border border-synse-border bg-synse-surface p-4 transition-colors hover:border-synse-primary"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-synse-text">
                    {SPORT_LABELS[atividade.sport]} · {formatDistance(atividade.distanceMeters)} km
                  </span>
                  <span className="block text-xs text-synse-muted">
                    {new Date(atividade.startedAt).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}{' '}
                    · {formatDuration(atividade.movingSeconds)} ·{' '}
                    {formatPace(atividade.averagePace)}/km
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-synse-muted" aria-hidden />
              </ListLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
