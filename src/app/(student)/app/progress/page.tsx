import type { Metadata } from 'next'

import { BotaoCompartilhar } from '@/features/share/share-button'
import { Activity, Dumbbell, TrendingUp, Trophy } from 'lucide-react'

import { ProgressLineChart } from '@/components/synse/charts/progress-line-chart'
import { ChartCard } from '@/components/synse/chart-card'
import { EmptyState } from '@/components/synse/empty-state'
import { ProgressRing } from '@/components/synse/progress-ring'
import { getStudentHome } from '@/features/students/app-service'
import { PortasDoProgresso } from '@/features/students/components/portas-do-progresso'
import { requireStudentSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { formatDate, formatNumber } from '@/lib/utils'

export const metadata: Metadata = { title: 'Progresso' }

export default async function StudentProgressPage() {
  const session = await requireStudentSession()
  const dataSource = await getDataSource()

  const agora = new Date()
  const noventaDias = new Date(agora.getTime() - 90 * 86_400_000)

  const [home, logs, assessments, recordes, totais] = await Promise.all([
    getStudentHome(session.organizationId, session.studentId),
    /*
     * O gráfico pede a janela que a tela anuncia ao lado — noventa dias. Antes
     * pedia a vida inteira: a leitura não tinha teto, a ordem é crescente, e o
     * corte do PostgREST levava o fim da linha. O gráfico parava antes do
     * presente sem nada indicando isso.
     */
    dataSource.listWorkoutLogs(session.organizationId, session.studentId, {
      since: noventaDias.toISOString(),
    }),
    dataSource.listAssessments(session.organizationId, session.studentId),
    /*
     * Recordes e totais vêm do Treino Ativo, que grava série a série. O
     * `listWorkoutLogs` acima continua alimentando o gráfico de carga enquanto
     * houver histórico antigo — quem treinava antes da 0026 não perde a linha.
     */
    dataSource.getPersonalRecords(session.studentId),
    dataSource.getWorkoutTotals(session.studentId, noventaDias.toISOString(), agora.toISOString()),
  ])

  const loadSeries = logs
    .filter((log) => log.load != null)
    .map((log) => ({ label: formatDate(log.performedAt), value: log.load as number }))

  const weightSeries = assessments
    .filter((assessment) => assessment.weight != null)
    .map((assessment) => ({
      label: formatDate(assessment.assessedAt),
      value: assessment.weight as number,
    }))

  const latest = assessments[assessments.length - 1]

  return (
    <div className="animate-fade-in-up space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-synse-text">Seu progresso</h1>
        <p className="text-sm text-synse-muted">
          O que mudou desde que você começou — carga, frequência e medidas.
        </p>
      </header>

      {/*
        ── A semana primeiro ───────────────────────────────────────────────
        A tela se chama "Seu progresso" e abria com três linhas de menu:
        Amigos, Sua análise, Synse Body. O dado da pessoa só começava abaixo
        da dobra. As portas desceram para o rodapé, menores, e o que sobe é o
        número que responde "como estou indo" — que é a pergunta que traz
        alguém aqui.
      */}
      <section className="flex items-center gap-5 rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm">
        <ProgressRing value={home.weeklyGoal.percentage} size={96} caption="semana" />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-synse-text">
            {home.weeklyGoal.done} de {home.weeklyGoal.target} treinos
          </p>
          <p className="text-xs text-synse-muted">
            {home.monthlyCheckIns} check-ins registrados neste mês.
          </p>
        </div>
      </section>

      {/* Os números que o Treino Ativo passou a gravar. Somem quando ainda não
          há treino registrado — cartão zerado não ensina nada. */}
      {totais.workouts > 0 && (
        <section className="rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm">
          <h2 className="text-sm font-semibold text-synse-text">Últimos 90 dias</h2>
          <dl className="mt-3 grid grid-cols-2 gap-4">
            <Numero rotulo="Treinos" valor={formatNumber(totais.workouts)} />
            <Numero
              rotulo="Volume"
              valor={`${formatNumber(Math.round(totais.volumeKg / 1000))} t`}
            />
            <Numero rotulo="Séries" valor={formatNumber(totais.sets)} />
            <Numero rotulo="Repetições" valor={formatNumber(totais.reps)} />
            <Numero
              rotulo="Duração média"
              valor={
                totais.averageDurationSeconds
                  ? `${Math.round(totais.averageDurationSeconds / 60)} min`
                  : '—'
              }
            />
            <Numero
              rotulo="Descanso médio"
              valor={totais.averageRestSeconds ? `${totais.averageRestSeconds}s` : '—'}
            />
          </dl>
        </section>
      )}

      {recordes.length > 0 && (
        <section className="rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-synse-text">
            <Trophy className="size-4 text-synse-primary" aria-hidden />
            Seus recordes
          </h2>
          <ul className="mt-3 divide-y divide-synse-border">
            {recordes.slice(0, 8).map((recorde) => (
              <li key={recorde.exerciseId} className="flex items-center gap-3 py-2.5">
                {/*
                  Nome em cima, números embaixo. Em linha única eram quatro
                  colunas num telefone — nome, data, carga e botão —, e a
                  primeira cedia: "Supino reto com…" cortava justamente o que
                  identifica o recorde.
                */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-synse-text">{recorde.exerciseName}</p>
                  <p className="text-xs text-synse-muted">
                    <span className="font-semibold tabular-nums text-synse-primary">
                      {formatNumber(recorde.maxWeight, { maximumFractionDigits: 1 })} kg
                    </span>
                    {' × '}
                    {recorde.reps} · {formatDate(recorde.achievedAt)}
                  </p>
                </div>
                <BotaoCompartilhar
                  formato="icone"
                  rotulo={`Compartilhar o recorde de ${recorde.exerciseName}`}
                  cartao={{
                    tipo: 'recorde',
                    exercicio: recorde.exerciseName,
                    quando: new Date(recorde.achievedAt),
                    peso: recorde.maxWeight,
                    repeticoes: recorde.reps,
                  }}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/*
        Três colunas, e não duas: com o cartão de "Treinos" removido sobraram
        três, e numa grade de duas o terceiro ficava sozinho na segunda linha
        ao lado de um buraco.
      */}
      <section className="grid grid-cols-3 gap-2.5">
        <StatTile
          icon={Dumbbell}
          label="Carga atual"
          value={
            home.currentLoad != null
              ? `${formatNumber(home.currentLoad, { maximumFractionDigits: 1 })} kg`
              : '—'
          }
          /*
           * "Supino reto" era legenda fixa no código, e o número vem de
           * qualquer exercício. Dizer o que é continua sendo o conserto;
           * filtrar por um exercício é decisão de produto, anotada.
           */
          caption="Último registro"
        />
        <StatTile
          icon={TrendingUp}
          label="Ganho de carga"
          value={
            home.loadGain != null
              ? `+${formatNumber(home.loadGain, { maximumFractionDigits: 1 })} kg`
              : '—'
          }
          caption="Da primeira à última"
          positive
        />
        <StatTile
          icon={Activity}
          label="Peso"
          value={
            latest?.weight != null
              ? `${formatNumber(latest.weight, { maximumFractionDigits: 1 })} kg`
              : '—'
          }
          caption={latest ? formatDate(latest.assessedAt) : 'Sem avaliação'}
        />
      </section>

      {loadSeries.length > 1 ? (
        <ChartCard
          title="Evolução de carga"
          description="Todos os exercícios com carga anotada, nos últimos 90 dias."
        >
          <ProgressLineChart data={loadSeries} unit=" kg" height={180} />
        </ChartCard>
      ) : (
        <EmptyState
          icon={Dumbbell}
          title="Sem histórico de carga"
          description="Registre a carga dos seus treinos para ver a evolução aqui."
        />
      )}

      {weightSeries.length > 1 && (
        <ChartCard title="Evolução do peso" description="Registrado nas avaliações físicas.">
          <ProgressLineChart data={weightSeries} unit=" kg" height={180} />
        </ChartCard>
      )}

      <PortasDoProgresso />
    </div>
  )
}

function StatTile({
  icon: Icon,
  label,
  value,
  caption,
  positive = false,
}: {
  icon: typeof Dumbbell
  label: string
  value: string
  caption: string
  positive?: boolean
}) {
  return (
    <div className="rounded-2xl border border-synse-border bg-synse-surface p-3.5 shadow-synse-sm">
      <Icon className="size-4 text-synse-muted" aria-hidden />
      <p className="mt-2 text-[11px] leading-tight text-synse-muted">{label}</p>
      {/*
        Sem `tabular-nums` aqui, de propósito: dígito de largura fixa alinha
        coluna de tabela, e num número solto e grande ele abre espaços — "49,1"
        sai frouxo. O alinhamento vertical que `tabular-nums` existe para dar
        não é necessário entre três cartões lado a lado.
      */}
      <p
        className={
          positive
            ? 'text-lg font-semibold text-synse-success'
            : 'text-lg font-semibold text-synse-text'
        }
      >
        {value}
      </p>
      <p className="text-[11px] leading-tight text-synse-muted">{caption}</p>
    </div>
  )
}

/** Um número do resumo. Pequeno de propósito: a tela é um celular na mão. */
function Numero({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs text-synse-muted">{rotulo}</dt>
      <dd className="text-lg font-semibold tabular-nums text-synse-text">{valor}</dd>
    </div>
  )
}
