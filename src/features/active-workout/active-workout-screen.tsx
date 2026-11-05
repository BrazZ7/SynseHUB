'use client'

import { useState } from 'react'

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
  Undo2,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AjustesDoTreino } from '@/features/active-workout/components/ajustes-do-treino'
import { BlocoDeRelato } from '@/features/active-workout/components/relato-do-treino'
import {
  duracaoEfetiva,
  exercicioAtual,
  resumo,
} from '@/features/active-workout/engine/workout-engine'
import type { PlannedExercise, WorkoutSession } from '@/features/active-workout/engine/types'
import type { RelatoDoTreino, ResumoDoTreino } from '@/features/active-workout/state'
import { useActiveWorkout, useRestCountdown } from '@/features/active-workout/use-active-workout'
import { usePreferenciasDoTreino } from '@/features/active-workout/use-preferencias-do-treino'
import { cn, formatNumber } from '@/lib/utils'
import type { WorkoutPreferences } from '@/types/domain'

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
  dono,
  planName,
  workoutPlanId,
  exercises,
  preferencias,
}: {
  /**
   * A matrícula do aluno, vinda da sessão autenticada na página.
   *
   * Separa o que este aparelho guarda. Chega como propriedade, e não lida no
   * cliente, porque identidade escolhida pelo navegador não é identidade.
   */
  dono: string
  planName: string
  workoutPlanId: string | null
  exercises: PlannedExercise[]
  preferencias: WorkoutPreferences
}) {
  const treino = useActiveWorkout(dono, preferencias)
  /*
   * As preferências vivem em dois lugares de propósito, e os dois são
   * necessários: no servidor, para acompanhar quem troca de aparelho; e dentro
   * da sessão do treino, porque é de lá que o engine lê. O `aplicar` abaixo
   * mantém o segundo em dia com o primeiro — `despachar` não faz nada quando
   * não há treino em andamento, que é justamente o caso da tela de abertura.
   */
  const ajustes = usePreferenciasDoTreino(preferencias, (p) =>
    treino.despachar({ type: 'SETTINGS', settings: p }),
  )

  const painel = (
    <AjustesDoTreino
      preferencias={ajustes.preferencias}
      erro={ajustes.erro}
      gravando={ajustes.gravando}
      onMudar={ajustes.mudar}
      onLigarSom={() => void treino.prepararSom()}
    />
  )

  if (treino.carregando) {
    return <div className="h-64 animate-pulse rounded-2xl bg-synse-surface-2" aria-hidden />
  }

  /*
   * Antes de qualquer painel: uma aba manda, a outra espera. A conferência vem
   * aqui, e não só na tela do treino, porque o momento perigoso inclui a
   * abertura — duas abas começando o treino ao mesmo tempo produziriam duas
   * sessões locais para a mesma sessão do servidor.
   */
  if (treino.comandoEmOutraAba) {
    return <OutraAba onAssumir={() => void treino.assumirComando()} />
  }

  if (!treino.sessao) {
    return (
      <div className="space-y-4">
        <Abertura
          planName={planName}
          exercises={exercises}
          onStart={() =>
            void treino.iniciar({
              workoutPlanId,
              planName,
              exercises,
              // O valor vivo, e não a prop: a pessoa pode ter mexido nos
              // ajustes logo antes de apertar "Começar treino".
              settings: ajustes.preferencias,
            })
          }
        />
        {painel}
      </div>
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
    return (
      <Resumo
        sessao={sessao}
        onFechar={(relato) => void treino.concluirTreino(relato ?? undefined)}
        onDesfazer={treino.podeDesfazer ? () => void treino.desfazer() : undefined}
      />
    )
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

      {treino.podeDesfazer && <Desfazer onDesfazer={() => void treino.desfazer()} />}

      <ProximoExercicio sessao={sessao} />

      {painel}

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
    <section className="relative overflow-hidden rounded-2xl bg-synse-gradient-deep p-6 text-white shadow-synse-lg">
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
            Série concluída: {sessao.setNumber}/{exercicio?.sets} · próxima com {sessao.currentReps}{' '}
            reps
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
    <section className="rounded-2xl border border-synse-success/40 bg-synse-success/10 p-5 text-center shadow-synse-sm">
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
        /*
         * Hoje este ramo não aparece: a última série do último exercício vai
         * direto para o resumo, sem passar por aqui (ver `encerramento.ts`).
         * Ele fica como defesa — e aponta para o mesmo encerramento do resumo,
         * porque foi justamente um botão esquecido aqui que deixou o
         * `finish_workout_session` sem chamador.
         */
        <Button
          size="lg"
          onClick={() => void treino.concluirTreino()}
          className="mt-5 h-16 w-full text-base font-semibold"
        >
          Concluir treino
        </Button>
      )}
    </section>
  )
}

// ── Outra aba ────────────────────────────────────────────────────────────────
/**
 * O treino está aberto em outra aba.
 *
 * Diz o que está acontecendo e oferece a saída, em vez de deixar as duas abas
 * gravando uma por cima da outra — que é o que fazia o treino andar para trás
 * sem ninguém ter desfeito nada.
 *
 * O texto não promete que a outra aba parou de contar: ele diz que **esta** não
 * está gravando. É o que se pode afirmar daqui.
 */
function OutraAba({ onAssumir }: { onAssumir: () => void }) {
  return (
    <section
      className="rounded-2xl border border-synse-warning/40 bg-synse-warning/10 p-5"
      role="status"
    >
      <TriangleAlert className="size-6 text-synse-warning" aria-hidden />
      <p className="mt-2 font-semibold text-synse-text">Seu treino está aberto em outra aba.</p>
      <p className="mt-1 text-sm text-synse-muted">
        Para não gravar duas versões do mesmo treino, esta aba parou de registrar. Continue na outra
        aba, ou traga o treino para cá.
      </p>
      <Button size="lg" onClick={onAssumir} className="mt-4 h-14 w-full">
        Treinar nesta aba
      </Button>
    </section>
  )
}

// ── Desfazer ─────────────────────────────────────────────────────────────────
/**
 * A volta do toque errado.
 *
 * Fica num só lugar, abaixo do painel do momento, e não dentro de cada estado:
 * o botão precisa estar sempre no mesmo ponto da tela para a mão achar sem
 * procurar. Discreto de propósito — concluir série é a ação principal, e dois
 * botões do mesmo tamanho lado a lado fariam o toque errado ficar mais fácil,
 * não menos.
 */
function Desfazer({ onDesfazer }: { onDesfazer: () => void }) {
  return (
    <Button variant="ghost" size="sm" onClick={onDesfazer} className="w-full text-synse-muted">
      <Undo2 className="size-3.5" aria-hidden />
      Desfazer a última série
    </Button>
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
    <section className="rounded-2xl border border-synse-warning/40 bg-synse-warning/10 p-5">
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
function Resumo({
  sessao,
  onFechar,
  onDesfazer,
}: {
  sessao: WorkoutSession
  onFechar: (relato: RelatoDoTreino | null) => void
  /** Ausente quando não há série para desfazer — treino vazio, por exemplo. */
  onDesfazer?: () => void
}) {
  const dados = resumo(sessao, sessao.finishedAt ?? Date.now())
  /*
   * `useState` direto como `onChange` do bloco: o setter é estável, então o
   * filho avisa durante o evento em vez de num efeito.
   */
  const [relato, setRelato] = useState<RelatoDoTreino | null>(null)

  return (
    <section className="overflow-hidden rounded-2xl bg-synse-gradient-deep p-6 text-white shadow-synse-lg">
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

      <BlocoDeRelato onChange={setRelato} />

      <div className="mt-6 grid grid-cols-1 gap-2">
        {/*
         * Um botão só, e o rótulo é que muda.
         *
         * Com "Enviar" separado de "Fechar", quem escolhesse o esforço e
         * tocasse em "Fechar" perderia o relato sem aviso — e não saberia,
         * porque a tela sai de cena. Aqui o mesmo toque leva as duas coisas,
         * e o rótulo diz qual das duas está acontecendo.
         */}
        <Button
          size="lg"
          onClick={() => onFechar(relato)}
          className="h-12 bg-white font-semibold text-synse-primary hover:bg-white/90"
        >
          {relato ? 'Enviar e fechar' : 'Fechar'}
        </Button>
        <Button variant="ghost" asChild className="text-white/80 hover:text-white">
          <Link href="/app/progress">
            <Timer className="size-4" aria-hidden />
            Ver progresso
          </Link>
        </Button>
        {onDesfazer && (
          /*
           * O desfazer mais importante da tela inteira. A última série do
           * último exercício encerra o treino na hora: o toque errado ali
           * trazia a pessoa para este resumo sem volta, olhando o número de um
           * treino que ela não terminou.
           */
          <Button variant="ghost" onClick={onDesfazer} className="text-white/70 hover:text-white">
            <Undo2 className="size-4" aria-hidden />
            Não terminei: desfazer a última série
          </Button>
        )}
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
