import type { Metadata } from 'next'

import { SEMANAS_DO_GRAFICO } from '@/features/workouts/ganho-de-carga'
import { BotaoCompartilhar } from '@/features/share/share-button'
import { Activity, Dumbbell, TrendingUp, Trophy } from 'lucide-react'

import { ProgressLineChart } from '@/components/synse/charts/progress-line-chart'
import { ChartCard } from '@/components/synse/chart-card'
import { EmptyState } from '@/components/synse/empty-state'
import { ProgressRing } from '@/components/synse/progress-ring'
import { getStudentHome } from '@/features/students/app-service'
import { PortasDoProgresso } from '@/features/students/components/portas-do-progresso'
import { LinhaInteira, PilhaDoApp } from '@/components/synse/duas-colunas'
import { RegistrarVisita } from '@/features/analytics/registrar-visita'
import { requireStudentSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { formatDate, formatNumber } from '@/lib/utils'

export const metadata: Metadata = { title: 'Progresso' }

export default async function StudentProgressPage() {
  const session = await requireStudentSession()
  const dataSource = await getDataSource()

  const agora = new Date()
  const noventaDias = new Date(agora.getTime() - 90 * 86_400_000)

  const [home, assessments, recordes, totais] = await Promise.all([
    getStudentHome(session.organizationId, session.studentId),
    dataSource.listAssessments(session.organizationId, session.studentId),
    dataSource.getPersonalRecords(session.studentId),
    dataSource.getWorkoutTotals(session.studentId, noventaDias.toISOString(), agora.toISOString()),
  ])

  /*
   * ── O gráfico é de um exercício, e vem de onde o treino entra ───────────
   *
   * Ele saía de `listWorkoutLogs`, isto é, de `workout_logs` — tabela em que
   * **nada no produto escreve**. Em academia real a linha nunca aparecia, por
   * mais que o aluno treinasse; na demonstração aparecia, porque a semente
   * preenche a antiga.
   *
   * E plotava a carga de **todos** os exercícios na mesma linha, o que não é
   * uma curva: um agachamento de 100 kg e uma rosca de 20 alternados desenham
   * um serrote que não diz nada. A linha agora é do mesmo exercício que os
   * cartões nomeiam — o mais treinado —, e `exercise_progress` (0027) já dava
   * essa série por semana desde sempre.
   *
   * Depois do lote, e não junto: depende de saber qual é o exercício.
   */
  const progresso = home.loadExercise
    ? await dataSource.getExerciseProgress(session.studentId, home.loadExercise.id, SEMANAS_DO_GRAFICO)
    : []

  const loadSeries = progresso
    .filter((ponto) => ponto.maxWeight != null)
    .map((ponto) => ({ label: formatDate(ponto.week), value: ponto.maxWeight as number }))

  const weightSeries = assessments
    .filter((assessment) => assessment.weight != null)
    .map((assessment) => ({
      label: formatDate(assessment.assessedAt),
      value: assessment.weight as number,
    }))

  const latest = assessments[assessments.length - 1]

  return (
    <PilhaDoApp className="animate-fade-in-up">
      {/*
        Conta que o resumo foi consultado.

        Em componente de cliente porque esta página é de servidor e o Next
        pré-busca rotas: contado aqui no servidor, o indicador somaria quem
        passou o dedo perto do link da aba. Montagem no cliente é o momento em
        que a tela existe para alguém.
      */}
      <RegistrarVisita nome="RESUMO_CONSULTADO" rotulo="PROGRESSO" />

      <LinhaInteira className="space-y-5">
        <header>
          <h1 className="text-2xl font-semibold text-synse-text">Seu progresso</h1>
          <p className="text-sm text-synse-muted">
            O que mudou desde que você começou — carga, frequência e medidas.
          </p>
        </header>
      </LinhaInteira>

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
        {/*
          Os dois cartões falam do **mesmo** exercício — o mais treinado —, e
          a legenda diz qual. "Supino reto" já foi legenda fixa no código com
          o número vindo de qualquer exercício; lado a lado, uma carga de
          agachamento e um ganho de rosca se contradiziam na mesma linha.

          Sem exercício nomeado, o número é o do caminho antigo (banco sem a
          0055): a legenda então não promete um exercício que não sabe qual é.
        */}
        <StatTile
          icon={Dumbbell}
          label="Carga atual"
          value={
            home.currentLoad != null
              ? `${formatNumber(home.currentLoad, { maximumFractionDigits: 1 })} kg`
              : '—'
          }
          caption={home.loadExercise?.nome ?? 'Último registro'}
        />
        <StatTile
          icon={TrendingUp}
          label="Ganho de carga"
          value={
            home.loadGain != null
              ? `+${formatNumber(home.loadGain, { maximumFractionDigits: 1 })} kg`
              : '—'
          }
          /*
           * Sem número, a legenda diz o que fazer para ele aparecer. "—" sem
           * explicação parece defeito da tela, e o aluno novo não tem como
           * adivinhar que faltam dois registros do mesmo exercício.
           */
          caption={
            home.loadGain != null
              ? (home.loadExercise?.nome ?? 'Da primeira à última')
              : 'Registre o mesmo exercício 2×'
          }
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
          description={`${home.loadExercise?.nome ?? 'Carga registrada'} — maior carga de cada semana.`}
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
    </PilhaDoApp>
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
