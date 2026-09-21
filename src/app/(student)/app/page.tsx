import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import {
  ArrowRight,
  CalendarDays,
  Droplets,
  Dumbbell,
  Footprints,
  Moon,
  Salad,
  Sparkles,
  Trophy,
  Wallet,
} from 'lucide-react'

import { ProgressRing } from '@/components/synse/progress-ring'
import { SynseLogo } from '@/components/synse/synse-logo'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { AppCheckInButton } from '@/features/checkin/app-checkin-button'
import { getChallengeBoard } from '@/features/challenges/service'
import { MarcadorNaTrilha } from '@/features/challenges/trail-marker'
import { NotificationsBell } from '@/features/notifications/notifications-bell'
import { getStudentHome } from '@/features/students/app-service'
import { horaLocal } from '@/features/schedule/week'
import { getDataSource } from '@/lib/database'
import { requireStudentSession } from '@/lib/auth/require-session'
import { StreakFlame } from '@/features/students/streak-flame'
import { calcularSequencia } from '@/features/students/streak'
import { cn, firstName, formatCurrency, formatDate, greeting } from '@/lib/utils'

export const metadata: Metadata = { title: 'Hoje' }

export default async function StudentHomePage() {
  const session = await requireStudentSession()
  const agora = new Date()
  const [home, challenges, aulas, conteudos, organizacao, checkIns] = await Promise.all([
    getStudentHome(session.organizationId, session.studentId),
    getChallengeBoard(session),
    getDataSource().then((dataSource) =>
      dataSource.listClassSessionsForStudent(session.organizationId, session.studentId, {
        from: agora.toISOString(),
        to: new Date(agora.getTime() + 7 * 86_400_000).toISOString(),
      }),
    ),
    // Os três últimos avisos da academia. Some quando não há nada publicado.
    getDataSource().then((dataSource) =>
      dataSource.listPublishedContent(session.organizationId, 3),
    ),
    /*
     * A academia, pelo fuso. O dia de um check-in às 23h só cai no lugar certo
     * se for agrupado no fuso de quem treinou — em UTC ele viraria o dia
     * seguinte e partiria a sequência de quem treina tarde.
     */
    getDataSource().then((dataSource) => dataSource.getOrganization(session.organizationId)),
    /*
     * Cento e oitenta check-ins cobrem meio ano de treino diário. A sequência
     * mais longa que existe é a que começou no primeiro deles; buscar o
     * histórico inteiro para contar dias seguidos seria carregar anos de linha
     * para usar as últimas semanas.
     */
    getDataSource().then((dataSource) =>
      dataSource.listCheckInsForStudent(session.organizationId, session.studentId, 180),
    ),
  ])

  const sequencia = calcularSequencia(checkIns, {
    fuso: organizacao?.timezone ?? 'America/Sao_Paulo',
    agora,
  })

  const desafio = challenges.active[0] ?? null

  /*
   * A próxima aula reservada, não a próxima aula da grade: o cartão existe para
   * lembrar do compromisso que a pessoa assumiu. Sem reserva, ele convida a
   * fazer uma.
   */
  const minhaProximaAula = aulas.find(
    (aula) => aula.status === 'SCHEDULED' && aula.myBookingStatus === 'BOOKED',
  )
  const proximaDaGrade = aulas.find((aula) => aula.status === 'SCHEDULED')

  return (
    <div className="animate-fade-in-up space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-synse-muted">{greeting()},</p>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-synse-text">
            {firstName(home.name)}
            <StreakFlame sequencia={sequencia} />
          </h1>
        </div>
        <div className="flex items-center gap-1">
          <NotificationsBell allHref="/app/notifications" />
          <SynseLogo variant="symbol" size="md" />
        </div>
      </header>

      {/* Cartão principal: o treino de hoje */}
      <section className="relative overflow-hidden rounded-2xl bg-synse-gradient-deep p-6 text-white shadow-synse-lg">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 size-52 rounded-full bg-synse-primary/25 blur-3xl"
        />

        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">Seu dia</p>

          {home.todayWorkout ? (
            <>
              <h2 className="mt-2 text-2xl font-semibold leading-tight text-white">
                {home.todayWorkout.name.replace(/^Treino [A-Z]+ — /, '')}
              </h2>
              <p className="mt-1 text-sm text-white/60">
                Divisão {home.todayWorkout.splitLabel} · {home.todayWorkout.exerciseCount}{' '}
                exercícios
              </p>
              <Button
                asChild
                variant="ghost"
                className="mt-4 bg-white/15 text-white hover:bg-white/25"
              >
                <Link href="/app/workout">
                  Ver treino
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </>
          ) : (
            /*
              Antes aqui dizia "nenhum treino atribuído, fale com o professor".
              Deixava de pé quem não tem academia — e mandava quem tem esperar.
              O treino base existe desde o primeiro minuto.
            */
            <>
              <h2 className="mt-2 text-2xl font-semibold leading-tight text-white">
                Treino base Synse
              </h2>
              <p className="mt-1 text-sm text-white/60">
                Corpo inteiro, 3× por semana. Vale até sua academia montar o seu.
              </p>
              <Button
                asChild
                variant="ghost"
                className="mt-4 bg-white/15 text-white hover:bg-white/25"
              >
                <Link href="/app/workout">
                  Ver treino base
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </>
          )}
        </div>
      </section>

      <AppCheckInButton alreadyCheckedIn={home.checkedInToday} />

      {/* Indicadores da semana */}
      <section className="grid grid-cols-2 gap-3">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm">
          <ProgressRing value={home.weeklyGoal.percentage} size={104} caption="da meta" />
          <p className="text-center text-xs text-synse-muted">
            Meta semanal
            <span className="mt-0.5 block text-sm font-medium text-synse-text">
              {home.weeklyGoal.done} de {home.weeklyGoal.target} treinos
            </span>
          </p>
        </div>

        <div className="flex flex-col justify-between gap-3 rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm">
          <div>
            <p className="text-xs text-synse-muted">Check-ins no mês</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-synse-text">
              {home.monthlyCheckIns}
            </p>
          </div>
          <div>
            <p className="text-xs text-synse-muted">Última presença</p>
            <p className="text-sm font-medium text-synse-text">
              {home.lastCheckInAt ? formatDate(home.lastCheckInAt) : 'Sem registro'}
            </p>
          </div>
        </div>
      </section>

      {/* Aulas — some enquanto a grade da academia estiver vazia */}
      {(minhaProximaAula || proximaDaGrade) && (
        <section className="rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-synse-muted">
                {minhaProximaAula ? 'Sua próxima aula' : 'Próxima aula na academia'}
              </p>
              <p className="mt-1 truncate text-lg font-semibold text-synse-text">
                {(minhaProximaAula ?? proximaDaGrade)!.name}
              </p>
              <p className="text-sm text-synse-muted">
                {new Date((minhaProximaAula ?? proximaDaGrade)!.startsAt).toLocaleDateString(
                  'pt-BR',
                  { weekday: 'long', day: '2-digit', month: '2-digit' },
                )}{' '}
                às {horaLocal((minhaProximaAula ?? proximaDaGrade)!.startsAt)}
              </p>
            </div>
            <CalendarDays className="size-5 shrink-0 text-synse-primary" aria-hidden />
          </div>

          {minhaProximaAula ? (
            <Badge variant="success" className="mt-3">
              Vaga confirmada
            </Badge>
          ) : (
            <p className="mt-3 text-xs text-synse-muted">
              Você ainda não reservou nenhuma aula desta semana.
            </p>
          )}

          <Button variant="outline" size="sm" asChild className="mt-3 w-full">
            <Link href="/app/schedule">
              Ver todas as aulas
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
        </section>
      )}

      {/* Da academia — some quando não há nada publicado */}
      {conteudos.length > 0 && (
        <section className="rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-synse-text">Da sua academia</h2>
            <Button variant="ghost" size="sm" asChild className="text-synse-muted">
              <Link href="/app/content">
                Ver tudo
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
          </div>

          <ul className="mt-2 divide-y divide-synse-border">
            {conteudos.slice(0, 3).map((item) => (
              <li key={item.id} className="py-2.5">
                <Link href="/app/content" className="block">
                  <p className="truncate text-sm font-medium text-synse-text">{item.title}</p>
                  {item.summary && (
                    <p className="truncate text-xs text-synse-muted">{item.summary}</p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Desafio do mês — some enquanto a migration 0014 não estiver aplicada */}
      {challenges.available && (
        /*
         * ── A trilha ──────────────────────────────────────────────────────
         *
         * A mesma arte do widget de meta semanal da aba Correr: a trilha
         * subindo a serra com o alfinete no ponto mais alto. O desafio do mês
         * nem sempre é de corrida — pode ser check-ins, carga, o que a
         * academia propuser —, mas a leitura da imagem é de percurso até um
         * ponto, que é o que qualquer meta mensal é.
         *
         * Um arquivo só, servindo os dois lugares: o navegador baixa uma vez
         * e o vínculo entre as duas telas fica de graça.
         *
         * Os tons são brancos com transparência, e não fichas do tema, porque
         * a arte é noturna nos dois temas. A pista da barra vem de
         * `synse-surface-2`, que sobre esta imagem desapareceria no tema
         * escuro — daí o `className` sobrescrevendo.
         */
        <section className="relative overflow-hidden rounded-2xl">
          <Image
            src="/synse-run-trilha.webp"
            alt=""
            aria-hidden
            width={960}
            height={369}
            sizes="(max-width: 512px) 100vw, 512px"
            className="absolute inset-0 size-full object-cover"
          />

          {/* O véu mora em `globals.css`; ver `.veu-da-trilha`. */}
          <div aria-hidden className="veu-da-trilha absolute inset-0" />

          {/*
           * O marcador vem **depois** do véu, de propósito. Por baixo dele o
           * alfinete saía lavado, um vulto pálido em vez de um ponto. Ele não
           * atrapalha a leitura porque mora na faixa direita da arte, a partir
           * de uns 80% da largura, e a coluna de texto para em 64%.
           */}
          <MarcadorNaTrilha fracao={(desafio?.percentage ?? 0) / 100} />

          <div className="relative p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-synse-primary-light">
                <Trophy className="size-3.5" aria-hidden />
                Desafio do mês
              </p>
              {desafio && (
                <span className="rounded-full border border-white/20 bg-white/15 px-2.5 py-0.5 text-xs font-medium tabular-nums text-white backdrop-blur-md">
                  {desafio.percentage}%
                </span>
              )}
            </div>

            {desafio ? (
              <>
                <p className="mt-1.5 max-w-[64%] text-lg font-semibold text-white">
                  {desafio.challenge.title}
                </p>
                <p className="max-w-[64%] text-sm text-white/70">
                  {desafio.progressValue.toLocaleString('pt-BR')} de{' '}
                  {desafio.targetValue.toLocaleString('pt-BR')} {desafio.challenge.unit}
                </p>
                <Progress value={desafio.percentage} className="mt-3 bg-white/20" />
              </>
            ) : (
              <p className="mt-1.5 max-w-[64%] text-sm text-white/70">
                Escolha um objetivo para este mês. No fim, você recebe a análise e a medalha.
              </p>
            )}

            <Link
              href="/app/challenges"
              className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-lg border border-white/20 bg-white/15 text-sm font-medium text-white backdrop-blur-md transition-colors hover:bg-white/25"
            >
              {desafio ? 'Registrar progresso' : 'Escolher meu desafio'}
            </Link>
          </div>
        </section>
      )}

      {/* Alimentação base */}
      <Link
        href="/app/nutrition"
        className="group flex items-center gap-4 rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm transition-colors hover:border-synse-primary"
      >
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-synse-mint/50 text-synse-primary"
          aria-hidden
        >
          <Salad className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-synse-text">Plano alimentar base</span>
          <span className="block text-xs text-synse-muted">
            Cinco refeições, com trocas para o dia corrido.
          </span>
        </span>
        <ArrowRight className="size-4 shrink-0 text-synse-muted transition-transform duration-200 group-hover:translate-x-0.5" />
      </Link>

      {/* Programa Synse */}
      <section className="rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-synse-primary">
              Programa Synse 30
            </p>
            <p className="mt-1 text-lg font-semibold text-synse-text">
              Dia {home.programDay.current} de {home.programDay.total}
            </p>
          </div>
          <Badge variant="primary" className="tabular-nums">
            {home.programDay.percentage}%
          </Badge>
        </div>

        <Progress
          value={home.programDay.percentage}
          className="mt-4"
          aria-label="Progresso do programa"
        />

        <ul className="mt-4 grid grid-cols-2 gap-2">
          <HabitItem icon={Droplets} label="Água" done />
          <HabitItem icon={Dumbbell} label="Treino" done={home.checkedInToday} />
          <HabitItem icon={Moon} label="Sono" done />
          <HabitItem icon={Footprints} label="Passos" done={false} />
        </ul>
      </section>

      {/* Financeiro */}
      <section className="rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs text-synse-muted">
              <Wallet className="size-3.5" aria-hidden />
              Próxima mensalidade
            </p>
            {home.nextCharge ? (
              <>
                <p className="mt-1.5 text-2xl font-semibold tabular-nums text-synse-text">
                  {formatCurrency(home.nextCharge.amount)}
                </p>
                <p className="text-sm text-synse-muted">
                  Vence {formatDate(home.nextCharge.dueDate)}
                  {home.planName && ` · ${home.planName}`}
                </p>
              </>
            ) : (
              <p className="mt-1.5 text-sm text-synse-success">Tudo em dia. Nada a pagar agora.</p>
            )}
          </div>
          <CalendarDays className="size-5 shrink-0 text-synse-muted" aria-hidden />
        </div>

        <Button variant="outline" asChild className="mt-4 w-full">
          <Link href="/app/finance">{home.nextCharge ? 'PAGAR AGORA' : 'Ver financeiro'}</Link>
        </Button>
      </section>

      {/* Synse+ */}
      <Link
        href="/app/synse"
        className="group flex items-center gap-4 rounded-2xl bg-synse-gradient p-5 text-white shadow-glow transition-transform duration-200 hover:-translate-y-0.5"
      >
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/20"
          aria-hidden
        >
          <Sparkles className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Conheça o Synse+</span>
          <span className="block text-xs text-white/75">
            Programas, receitas, desafios e conteúdos exclusivos.
          </span>
        </span>
        <ArrowRight className="size-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" />
      </Link>
    </div>
  )
}

function HabitItem({
  icon: Icon,
  label,
  done,
}: {
  icon: typeof Droplets
  label: string
  done: boolean
}) {
  return (
    <li
      className={cn(
        'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
        done ? 'bg-synse-success/10 text-synse-success' : 'bg-synse-surface-2 text-synse-muted',
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="flex-1">{label}</span>
      <span aria-hidden>{done ? '✓' : '·'}</span>
      <span className="sr-only">{done ? 'concluído' : 'pendente'}</span>
    </li>
  )
}
