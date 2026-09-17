'use client'

import Link from 'next/link'
import {
  Check,
  ChevronRight,
  Minus,
  Plus,
  SkipForward,
  Timer,
  TrendingUp,
  TriangleAlert,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  duracaoEfetiva,
  exercicioAtual,
  resumo,
} from '@/features/active-workout/engine/workout-engine'
import type { PlannedExercise, WorkoutSession } from '@/features/active-workout/engine/types'
import type { ResumoDoTreino } from '@/features/active-workout/state'
import { useActiveWorkout, useRestCountdown } from '@/features/active-workout/use-active-workout'
import { cn, formatNumber } from '@/lib/utils'

/**
 * A tela do treino.
 *
 * Desenhada para uma mão cansada segurando o celular: o que decide a próxima
 * ação ocupa a maior área da tela, e o número que muda — carga, reps, tempo —
 * é grande o bastante para ler de relance entre uma série e outra.
 *
 * O cronômetro está num componente separado de propósito. Ele redesenha quatro
 * vezes por segundo; o resto da tela, não.
 */

const mmss = (segundos: number) =>
  `${String(Math.floor(segundos / 60)).padStart(2, '0')}:${String(segundos % 60).padStart(2, '0')}`

export function ActiveWorkoutScreen({
  planName,
  workoutPlanId,
  exercises,
}: {
  planName: string
  workoutPlanId: string | null
  exercises: PlannedExercise[]
}) {
  const treino = useActiveWorkout()

  if (treino.carregando) {
    return <div className="h-64 animate-pulse rounded-2xl bg-synse-surface-2" aria-hidden />
  }

  if (!treino.sessao) {
    return (
      <Abertura
        planName={planName}
        exercises={exercises}
        onStart={() => void treino.iniciar({ workoutPlanId, planName, exercises })}
      />
    )
  }

  const sessao = treino.sessao

  /*
   * Treino guardado de outro plano: oferecer "continuar" é melhor que trocar
   * em silêncio, porque a pessoa pode ter aberto a tela errada — e pior seria
   * descartar quarenta minutos de supino sem perguntar.
   */
  if (sessao.workoutPlanId !== workoutPlanId && sessao.state !== 'WORKOUT_COMPLETED') {
    return (
      <Retomada
        sessao={sessao}
        onContinuar={() => {}}
        onDescartar={() => void treino.descartar()}
      />
    )
  }

  if (sessao.state === 'WORKOUT_COMPLETED') {
    return <Resumo sessao={sessao} onFechar={() => void treino.descartar()} />
  }

  return (
    <div className="space-y-4">
      <Cabecalho
        sessao={sessao}
        progresso={treino.progresso}
        pendentes={treino.pendentes}
        resumoDaFila={treino.resumoDaFila}
      />

      {sessao.state === 'RESTING' || sessao.state === 'REST_FINISHED' ? (
        <PainelDescanso treino={treino} sessao={sessao} />
      ) : sessao.state === 'EXERCISE_COMPLETED' ? (
        <ExercicioConcluido treino={treino} sessao={sessao} />
      ) : (
        <PainelSerie treino={treino} sessao={sessao} />
      )}

      <ProximoExercicio sessao={sessao} />

      <Button
        variant="ghost"
        size="sm"
        className="w-full text-synse-muted"
        onClick={() => void treino.encerrar('ABANDONED')}
      >
        Encerrar treino
      </Button>
    </div>
  )
}

// ── Abertura ─────────────────────────────────────────────────────────────────
function Abertura({
  planName,
  exercises,
  onStart,
}: {
  planName: string
  exercises: PlannedExercise[]
  onStart: () => void
}) {
  const series = exercises.reduce((soma, e) => soma + e.sets, 0)

  return (
    <section className="bg-synse-gradient-deep relative overflow-hidden rounded-2xl p-6 text-white shadow-synse-lg">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">Treino Ativo</p>
      <h2 className="mt-1 text-2xl font-semibold">{planName}</h2>
      <p className="mt-1 text-sm text-white/80">
        {exercises.length} exercícios · {series} séries
      </p>

      <Button
        size="lg"
        onClick={onStart}
        className="mt-5 h-14 w-full bg-white text-base font-semibold text-synse-primary hover:bg-white/90"
      >
        Começar treino
      </Button>
      <p className="mt-3 text-xs text-white/70">
        O Synse acompanha o descanso e avisa quando a próxima série estiver pronta — mesmo com a
        tela bloqueada.
      </p>
    </section>
  )
}

// ── Cabeçalho ────────────────────────────────────────────────────────────────
function Cabecalho({
  sessao,
  progresso,
  pendentes,
  resumoDaFila,
}: {
  sessao: WorkoutSession
  progresso: number
  pendentes: number
  resumoDaFila: ResumoDoTreino
}) {
  return (
    <header className="rounded-2xl border border-synse-border bg-synse-surface p-4 shadow-synse-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-synse-primary">
            Treino Ativo
          </p>
          <h1 className="truncate text-lg font-semibold text-synse-text">{sessao.planName}</h1>
        </div>
        {pendentes > 0 && (
          <Badge variant="warning" title="Séries aguardando conexão">
            {pendentes} a sincronizar
          </Badge>
        )}
      </div>

      {/*
        O que a fila desistiu de enviar. O contador acima não serve para isto:
        ele diz quantas estão a caminho, e uma série descartada não está a
        caminho de lugar nenhum.
      */}
      {resumoDaFila?.tom === 'alerta' && (
        <p
          role="status"
          className="mt-3 flex items-start gap-2 rounded-lg border border-synse-warning/40 bg-synse-warning/5 px-3 py-2 text-xs text-synse-text"
        >
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {resumoDaFila.texto}
        </p>
      )}

      <div className="mt-3 flex items-center gap-3">
        <div
          className="h-2 flex-1 overflow-hidden rounded-full bg-synse-border"
          role="progressbar"
          aria-valuenow={Math.round(progresso * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progresso do treino"
        >
          <div
            className="h-full rounded-full bg-synse-primary transition-[width] duration-500"
            style={{ width: `${progresso * 100}%` }}
          />
        </div>
        <span className="text-xs font-semibold tabular-nums text-synse-muted">
          {Math.round(progresso * 100)}%
        </span>
      </div>
    </header>
  )
}

// ── Série em curso ───────────────────────────────────────────────────────────
function PainelSerie({
  treino,
  sessao,
}: {
  treino: ReturnType<typeof useActiveWorkout>
  sessao: WorkoutSession
}) {
  const exercicio = exercicioAtual(sessao)
  if (!exercicio) return null

  return (
    <section className="rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm">
      <h2 className="text-center text-xl font-semibold text-synse-text">{exercicio.name}</h2>
      <p className="mt-1 text-center text-sm text-synse-muted">
        Série {sessao.setNumber} de {exercicio.sets}
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Contador
          rotulo="Carga"
          valor={sessao.currentWeight === null ? '—' : `${sessao.currentWeight}`}
          unidade="kg"
          onMenos={() => treino.despachar({ type: 'ADJUST_WEIGHT', delta: -2.5 })}
          onMais={() => treino.despachar({ type: 'ADJUST_WEIGHT', delta: 2.5 })}
        />
        <Contador
          rotulo="Repetições"
          valor={String(sessao.currentReps)}
          onMenos={() => treino.despachar({ type: 'ADJUST_REPS', delta: -1 })}
          onMais={() => treino.despachar({ type: 'ADJUST_REPS', delta: 1 })}
        />
      </div>

      <Button
        size="lg"
        onClick={() => void treino.concluirSerie()}
        className="mt-5 h-16 w-full text-base font-semibold"
      >
        <Check className="size-5" aria-hidden />
        Concluir série
      </Button>
    </section>
  )
}

/** Um número grande entre dois alvos de toque generosos. */
function Contador({
  rotulo,
  valor,
  unidade,
  onMenos,
  onMais,
}: {
  rotulo: string
  valor: string
  unidade?: string
  onMenos: () => void
  onMais: () => void
}) {
  return (
    <div className="rounded-xl border border-synse-border bg-synse-surface-2 p-3">
      <p className="text-center text-[10px] font-semibold uppercase tracking-wide text-synse-muted">
        {rotulo}
      </p>
      <p className="mt-1 text-center text-3xl font-semibold tabular-nums text-synse-text">
        {valor}
        {unidade && <span className="ml-1 text-sm text-synse-muted">{unidade}</span>}
      </p>
      <div className="mt-2 flex gap-2">
        <Button
          variant="outline"
          onClick={onMenos}
          aria-label={`Diminuir ${rotulo.toLowerCase()}`}
          className="h-11 flex-1"
        >
          <Minus className="size-4" aria-hidden />
        </Button>
        <Button
          variant="outline"
          onClick={onMais}
          aria-label={`Aumentar ${rotulo.toLowerCase()}`}
          className="h-11 flex-1"
        >
          <Plus className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  )
}

// ── Descanso ─────────────────────────────────────────────────────────────────
function PainelDescanso({
  treino,
  sessao,
}: {
  treino: ReturnType<typeof useActiveWorkout>
  sessao: WorkoutSession
}) {
  const exercicio = exercicioAtual(sessao)
  const acabou = sessao.state === 'REST_FINISHED'

  return (
    <section
      className={cn(
        'rounded-2xl border p-5 text-center shadow-synse-sm transition-colors',
        acabou
          ? 'border-synse-success/40 bg-synse-success/10'
          : 'border-synse-primary/30 bg-synse-surface',
      )}
      aria-live="polite"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-synse-muted">
        {acabou ? 'Descanso concluído' : 'Descanso'}
      </p>

      {acabou ? (
        <>
          <p className="mt-2 text-2xl font-semibold text-synse-success">Série pronta</p>
          <p className="mt-1 text-sm text-synse-muted">
            Série {sessao.setNumber + 1} de {exercicio?.sets} · {sessao.currentReps} reps
            {sessao.currentWeight !== null && ` · ${sessao.currentWeight} kg`}
          </p>
          <Button
            size="lg"
            onClick={() => treino.despachar({ type: 'NEXT_SET', agora: Date.now() })}
            className="mt-5 h-16 w-full text-base font-semibold"
          >
            Iniciar próxima série
          </Button>
        </>
      ) : (
        <>
          <Cronometro restEndsAt={sessao.restEndsAt} />
          <p className="mt-2 text-sm text-synse-muted">
            Série concluída: {sessao.setNumber}/{exercicio?.sets} · próxima com{' '}
            {sessao.currentReps} reps
            {sessao.currentWeight !== null && ` e ${sessao.currentWeight} kg`}
          </p>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={() => treino.despachar({ type: 'SKIP_REST', agora: Date.now() })}
              className="h-12"
            >
              <SkipForward className="size-4" aria-hidden />
              Pular
            </Button>
            <Button
              variant="outline"
              onClick={() => treino.despachar({ type: 'ADD_REST', segundos: 30 })}
              className="h-12"
            >
              <Plus className="size-4" aria-hidden />
              30 seg
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => treino.despachar({ type: 'ADD_REST', segundos: -30 })}
            className="mt-2 text-synse-muted"
          >
            <Minus className="size-3.5" aria-hidden />
            30 segundos
          </Button>
        </>
      )}
    </section>
  )
}

/**
 * O único pedaço que redesenha a cada tique.
 *
 * Separado do painel para que os botões, o nome do exercício e o progresso
 * fiquem fora do ciclo do cronômetro.
 */
function Cronometro({ restEndsAt }: { restEndsAt: number | null }) {
  const restante = useRestCountdown(restEndsAt)
  return (
    <p className="mt-2 text-6xl font-semibold tabular-nums text-synse-primary" aria-live="off">
      {mmss(restante)}
    </p>
  )
}

// ── Fim do exercício ─────────────────────────────────────────────────────────
function ExercicioConcluido({
  treino,
  sessao,
}: {
  treino: ReturnType<typeof useActiveWorkout>
  sessao: WorkoutSession
}) {
  const proximo = sessao.exercises[sessao.exerciseIndex + 1]

  return (
    <section className="border-synse-success/40 bg-synse-success/10 rounded-2xl border p-5 text-center shadow-synse-sm">
      <Check className="mx-auto size-8 text-synse-success" aria-hidden />
      <p className="mt-2 text-lg font-semibold text-synse-text">
        {exercicioAtual(sessao)?.name} concluído
      </p>
      {proximo ? (
        <>
          <p className="mt-1 text-sm text-synse-muted">
            Próximo: {proximo.name} · {proximo.sets} × {proximo.reps}
          </p>
          <Button
            size="lg"
            onClick={() => treino.despachar({ type: 'NEXT_EXERCISE', agora: Date.now() })}
            className="mt-5 h-16 w-full text-base font-semibold"
          >
            Ir para {proximo.name}
            <ChevronRight className="size-5" aria-hidden />
          </Button>
        </>
      ) : (
        <Button
          size="lg"
          onClick={() => void treino.encerrar('COMPLETED')}
          className="mt-5 h-16 w-full text-base font-semibold"
        >
          Concluir treino
        </Button>
      )}
    </section>
  )
}

// ── Próximo ──────────────────────────────────────────────────────────────────
function ProximoExercicio({ sessao }: { sessao: WorkoutSession }) {
  const proximo = sessao.exercises[sessao.exerciseIndex + 1]
  if (!proximo) return null

  return (
    <p className="text-center text-xs text-synse-muted">
      Depois: {proximo.name} · {proximo.sets} × {proximo.reps}
    </p>
  )
}

// ── Retomada ─────────────────────────────────────────────────────────────────
function Retomada({
  sessao,
  onContinuar,
  onDescartar,
}: {
  sessao: WorkoutSession
  onContinuar: () => void
  onDescartar: () => void
}) {
  return (
    <section className="border-synse-warning/40 bg-synse-warning/10 rounded-2xl border p-5">
      <p className="font-semibold text-synse-text">Você tem um treino em andamento.</p>
      <p className="mt-1 text-sm text-synse-muted">
        {sessao.planName} · {sessao.completedSets.length} séries registradas.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-2">
        <Button size="lg" onClick={onContinuar} className="h-14">
          Continuar treino
        </Button>
        <Button variant="ghost" size="sm" onClick={onDescartar} className="text-synse-muted">
          Descartar e começar outro
        </Button>
      </div>
    </section>
  )
}

// ── Resumo ───────────────────────────────────────────────────────────────────
function Resumo({ sessao, onFechar }: { sessao: WorkoutSession; onFechar: () => void }) {
  const dados = resumo(sessao, sessao.finishedAt ?? Date.now())

  return (
    <section className="bg-synse-gradient-deep overflow-hidden rounded-2xl p-6 text-white shadow-synse-lg">
      <TrendingUp className="size-8" aria-hidden />
      <h2 className="mt-2 text-2xl font-semibold">Treino concluído</h2>
      <p className="text-sm text-white/80">{sessao.planName}</p>

      <dl className="mt-5 grid grid-cols-2 gap-4">
        <Metrica rotulo="Duração" valor={mmss(dados.duracaoSegundos)} />
        <Metrica rotulo="Volume" valor={`${formatNumber(dados.volumeKg)} kg`} />
        <Metrica rotulo="Exercícios" valor={String(dados.exercicios)} />
        <Metrica rotulo="Séries" valor={String(dados.series)} />
        <Metrica rotulo="Repetições" valor={String(dados.repeticoes)} />
        <Metrica
          rotulo="Descanso médio"
          valor={dados.descansoMedioSegundos ? `${dados.descansoMedioSegundos}s` : '—'}
        />
      </dl>

      <div className="mt-6 grid grid-cols-1 gap-2">
        <Button
          size="lg"
          onClick={onFechar}
          className="h-12 bg-white font-semibold text-synse-primary hover:bg-white/90"
        >
          Fechar
        </Button>
        <Button variant="ghost" asChild className="text-white/80 hover:text-white">
          <Link href="/app/progress">
            <Timer className="size-4" aria-hidden />
            Ver progresso
          </Link>
        </Button>
      </div>
    </section>
  )
}

function Metrica({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs text-white/70">{rotulo}</dt>
      <dd className="text-xl font-semibold tabular-nums">{valor}</dd>
    </div>
  )
}

export { duracaoEfetiva }
