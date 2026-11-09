import Link from 'next/link'
import {
  ArrowDownRight,
  ArrowUpRight,
  Dumbbell,
  Footprints,
  Minus,
  QrCode,
  Scale,
  Timer,
} from 'lucide-react'

import { ProgressRing } from '@/components/synse/progress-ring'
import { duracao, pesoEmKg, plural, quilometros } from '@/features/students/numeros'
import {
  comparar,
  frase,
  metaDaSemana,
  percentualDaMeta,
  tempoEmMovimento,
} from '@/features/students/semana'
import { cn } from '@/lib/utils'
import type { WeekSummary } from '@/types/domain'

/**
 * ── O resumo da semana ───────────────────────────────────────────────────────
 *
 * Uma tela para a pergunta que a pessoa faz no domingo à noite: a semana
 * valeu? O histórico (0064) responde "o que eu fiz" item por item; aqui a
 * resposta é fechada, com a semana anterior ao lado para dar escala.
 *
 * ── A comparação só aparece quando existe ────────────────────────────────────
 *
 * Nada de "0%" nem de seta reta para quem não tem semana anterior com dado. A
 * ausência de comparação é informação: quem começou nesta semana não regrediu,
 * e quem não se pesou não manteve o peso.
 *
 * ── A meta é a declarada ─────────────────────────────────────────────────────
 *
 * Vem de `days_per_week` da entrada guiada (0063). Quem não respondeu vê a
 * meta padrão **com o rótulo dizendo que é padrão** e um atalho para definir a
 * sua — em vez de um número que parece escolha dela.
 */

/** Uma seta com o tamanho da diferença, ou nada quando não há o que comparar. */
function Delta({
  agora,
  antes,
  unidade,
  /** Para peso, cair é o que a maioria quer: a cor segue a intenção, não o sinal. */
  menorEMelhor = false,
  casas = 0,
}: {
  agora: number | null
  antes: number | null
  /** Singular e plural — "1 treino", "2 treinos". Sem "(s)". */
  unidade: [string, string]
  menorEMelhor?: boolean
  casas?: number
}) {
  const { delta, direcao } = comparar(agora, antes)
  if (direcao === null) return null

  /*
   * Zero contra zero não merece linha. "0 treinos, igual à semana passada" é
   * duas linhas para dizer que nada aconteceu — e o cartão já mostra o zero.
   */
  if (direcao === 'igual' && (agora ?? 0) === 0) return null

  if (direcao === 'igual') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-synse-muted">
        <Minus className="size-3" aria-hidden />
        igual à semana passada
      </span>
    )
  }

  const subiu = direcao === 'subiu'
  const bom = menorEMelhor ? !subiu : subiu
  const Icone = subiu ? ArrowUpRight : ArrowDownRight

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs font-medium',
        bom ? 'text-synse-primary' : 'text-synse-muted',
      )}
    >
      <Icone className="size-3" aria-hidden />
      {/*
        `Math.abs` com o sinal já dito pela seta: "↓ 1,2 kg" lê melhor que
        "↓ -1,2 kg", que faz a pessoa processar duas negações.
      */}
      {Math.abs(delta).toFixed(casas).replace('.', ',')}{' '}
      {plural(Number(Math.abs(delta).toFixed(casas)), unidade[0], unidade[1])}
    </span>
  )
}

function Cartao({
  icone: Icone,
  rotulo,
  valor,
  abaixo,
  children,
}: {
  icone: typeof Dumbbell
  rotulo: string
  valor: string
  abaixo?: string | null
  children?: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-synse-border bg-synse-surface p-4 shadow-synse-sm">
      <div className="flex items-center gap-2 text-synse-muted">
        <Icone className="size-4 shrink-0" aria-hidden />
        <p className="text-xs">{rotulo}</p>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-synse-text">{valor}</p>
      {abaixo && <p className="text-xs text-synse-muted">{abaixo}</p>}
      {children && <div className="mt-1">{children}</div>}
    </div>
  )
}

export function ResumoDaSemana({
  semana,
  anterior,
  intervalo,
}: {
  semana: WeekSummary
  anterior: WeekSummary | null
  /** "27/10 a 02/11", montado no servidor com o fuso da academia. */
  intervalo: string
}) {
  const meta = metaDaSemana(semana.targetDays)
  const percentual = percentualDaMeta(semana.daysTrained, meta.dias)

  return (
    <div className="space-y-4">
      {/* O anel e a frase: o que a pessoa vê antes de ler qualquer número. */}
      <section className="flex items-center gap-5 rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm">
        <ProgressRing value={percentual} size={104} caption="da meta" />
        <div className="min-w-0 space-y-1">
          <p className="text-base font-semibold text-synse-text">{frase(semana)}</p>
          <p className="text-sm text-synse-muted">
            {semana.daysTrained} de {meta.dias} dias treinados
          </p>
          {meta.declarada ? (
            <p className="text-xs text-synse-muted">
              Sua meta, da entrada guiada.{' '}
              <Link href="/app/comecar" className="text-synse-primary underline-offset-2 hover:underline">
                Mudar
              </Link>
            </p>
          ) : (
            <p className="text-xs text-synse-muted">
              {/*
                Dizer que a meta é nossa, e não dela. O anel pela metade de quem
                nunca escolheu cinco dias é um julgamento que ninguém pediu.
              */}
              Meta padrão.{' '}
              <Link href="/app/comecar" className="text-synse-primary underline-offset-2 hover:underline">
                Definir a sua
              </Link>
            </p>
          )}
          <p className="text-xs text-synse-muted">{intervalo}</p>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <Cartao
          icone={Dumbbell}
          rotulo="Treinos"
          valor={String(semana.workouts)}
          abaixo={
            semana.setsCount > 0
              ? `${semana.setsCount} séries · ${Math.round(semana.volumeKg)} kg`
              : null
          }
        >
          <Delta agora={semana.workouts} antes={anterior?.workouts ?? null} unidade={['treino', 'treinos']} />
        </Cartao>

        <Cartao
          icone={Timer}
          rotulo="Em movimento"
          valor={tempoEmMovimento(semana) ?? '—'}
          abaixo={
            /*
             * A quebra entre treino e corrida só aparece quando as duas
             * existem: "1h30 de treino" ao lado de "1h30" é a mesma coisa dita
             * duas vezes.
             */
            semana.runSeconds > 0 && semana.workoutSeconds > 0
              ? `${duracao(semana.workoutSeconds) ?? '—'} de treino · ${duracao(semana.runSeconds) ?? '—'} correndo`
              : null
          }
        />

        <Cartao
          icone={Footprints}
          rotulo="Corrida"
          valor={semana.runs > 0 ? quilometros(semana.distanceMeters) : '—'}
          abaixo={
            semana.runs > 0
              ? `${semana.runs} ${plural(semana.runs, 'atividade', 'atividades')}`
              : 'Nenhuma nesta semana'
          }
        >
          {semana.runs > 0 && (
            <Delta
              agora={semana.distanceMeters / 1000}
              antes={anterior?.runs ? anterior.distanceMeters / 1000 : null}
              unidade={['km', 'km']}
              casas={1}
            />
          )}
        </Cartao>

        <Cartao
          icone={QrCode}
          rotulo="Check-ins"
          valor={String(semana.checkIns)}
          abaixo={semana.checkIns === 0 ? 'Nenhum registrado' : null}
        />

        {/*
          Esforço e peso somem quando faltam, em vez de mostrar "—".

          Um cartão vazio ocupa o mesmo espaço de um cheio e não diz nada; pior,
          sugere que a pessoa deveria ter registrado. Quem nunca relatou esforço
          não precisa de um lugar na tela lembrando disso toda semana.
        */}
        {semana.avgEffort != null && (
          <Cartao
            icone={Dumbbell}
            rotulo="Esforço médio"
            valor={`${semana.avgEffort.toFixed(1).replace('.', ',')}/10`}
            abaixo="Do que você relatou ao fim do treino"
          >
            <Delta
              agora={semana.avgEffort}
              antes={anterior?.avgEffort ?? null}
              unidade={['ponto', 'pontos']}
              casas={1}
            />
          </Cartao>
        )}

        {semana.weightKg != null && (
          <Cartao
            icone={Scale}
            rotulo="Peso"
            valor={pesoEmKg(semana.weightKg)}
            abaixo="Última pesagem da semana"
          >
            <Delta
              agora={semana.weightKg}
              antes={anterior?.weightKg ?? null}
              unidade={['kg', 'kg']}
              casas={1}
              /*
               * A seta de queda fica verde aqui, e só aqui. Não é opinião sobre
               * o corpo de ninguém: é o único número da tela em que a direção
               * desejada depende do objetivo, e `EMAGRECER` é o objetivo mais
               * declarado na entrada guiada. Quem quer ganhar massa lê o número,
               * que é o que importa — a cor não muda o peso.
               */
              menorEMelhor
            />
          </Cartao>
        )}
      </section>
    </div>
  )
}
