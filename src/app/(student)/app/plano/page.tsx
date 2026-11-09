import type { Metadata } from 'next'
import { Bell, Clock } from 'lucide-react'

import { BackLink } from '@/components/synse/back-link'
import { ColunaDeLeitura } from '@/components/synse/duas-colunas'
import { PageHeader } from '@/components/synse/page-header'
import { ProgressRing } from '@/components/synse/progress-ring'
import { BotaoPapelDeParede } from '@/features/plano/botao-papel-de-parede'
import { Blocos, Meta } from '@/features/plano/editor-do-plano'
import {
  agoraEDepois,
  blocosDoDia,
  diaIso,
  nomeDoBloco,
  progressoDoDia,
  quantosLembram,
  rotuloDoTipo,
} from '@/features/plano/state'
import { requireStudentSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { seAindaNaoMigrou } from '@/lib/database/pending-migration'
import type { RoutineBlock, RoutinePlan } from '@/types/domain'

export const metadata: Metadata = { title: 'Meu plano' }

/**
 * ── Meu plano ───────────────────────────────────────────────────────────────
 *
 * A rotina inteira num lugar: acordar, trabalhar, comer, beber água, treinar,
 * dormir — com a meta por cima para dizer para quê.
 *
 * A ordem da tela é a ordem das perguntas: **o que é agora**, depois a meta,
 * depois o dia inteiro, depois o editor. Quem abre no meio da tarde quer o
 * primeiro; quem abre para montar quer o último, e desce até ele.
 */
export default async function PlanoPage() {
  await requireStudentSession()
  const dataSource = await getDataSource()

  /*
   * `seAindaNaoMigrou` porque a 0070 pode não ter sido colada. Plano vazio é o
   * estado honesto nesse intervalo: a tela abre pedindo a meta, e a primeira
   * gravação mostra o erro de verdade em vez de a página quebrar inteira.
   */
  const [plano, blocos] = await Promise.all([
    dataSource.getRoutinePlan().catch(seAindaNaoMigrou<RoutinePlan | null>(null)),
    dataSource.listRoutineBlocks().catch(seAindaNaoMigrou<RoutineBlock[]>([])),
  ])

  const agora = new Date()
  const { atual, proximo } = agoraEDepois(blocos, agora)
  const hoje = blocosDoDia(blocos, diaIso(agora))
  const comLembrete = quantosLembram(blocos)

  return (
    <ColunaDeLeitura className="animate-fade-in-up space-y-4">
      <BackLink href="/app/profile" label="Perfil" />
      <PageHeader
        title="Meu plano"
        description="Sua rotina do dia inteiro, com a meta por cima. Só você vê."
      />

      {/* ── O que é agora ─────────────────────────────────────────────────── */}
      {hoje.length > 0 && (
        <section className="flex items-center gap-4 rounded-2xl border border-synse-border bg-synse-surface p-4 shadow-synse-sm">
          <ProgressRing value={progressoDoDia(blocos, agora)} size={84} caption="do dia" />
          <div className="min-w-0 space-y-1">
            {atual ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-synse-muted">
                  Agora
                </p>
                <p className="truncate text-lg font-semibold text-synse-text">
                  {nomeDoBloco(atual)}
                </p>
              </>
            ) : (
              <p className="text-lg font-semibold text-synse-text">O dia ainda vai começar.</p>
            )}
            {proximo && (
              <p className="flex items-center gap-1.5 truncate text-xs text-synse-muted">
                <Clock className="size-3.5 shrink-0" aria-hidden />
                Depois: {proximo.atTime} · {nomeDoBloco(proximo)}
              </p>
            )}
          </div>
        </section>
      )}

      <Meta plano={plano ?? { goal: null, wakeAt: null, sleepAt: null }} />

      {/* ── O dia, em linha ──────────────────────────────────────────────── */}
      {hoje.length > 0 && (
        <section className="rounded-2xl border border-synse-border bg-synse-surface p-4 shadow-synse-sm">
          <h2 className="text-sm font-semibold text-synse-text">
            {agora.toLocaleDateString('pt-BR', { weekday: 'long' })}
          </h2>

          <ol className="mt-3 space-y-0">
            {hoje.map((bloco) => {
              const passou = bloco.atTime <= `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`
              const eAgora = atual?.id === bloco.id

              return (
                <li key={bloco.id} className="flex gap-3">
                  {/*
                    O fio do tempo, desenhado com borda e não com um elemento
                    próprio: assim ele acompanha a altura real da linha, que
                    muda quando o nome quebra.
                  */}
                  <div className="flex w-14 shrink-0 justify-end pt-0.5">
                    <span
                      className={
                        passou
                          ? 'text-sm font-semibold tabular-nums text-synse-primary'
                          : 'text-sm tabular-nums text-synse-muted'
                      }
                    >
                      {bloco.atTime}
                    </span>
                  </div>

                  <div className="relative flex flex-col items-center">
                    <span
                      className={
                        eAgora
                          ? 'mt-1.5 size-3 rounded-full bg-synse-primary ring-4 ring-synse-primary/20'
                          : passou
                            ? 'mt-2 size-2 rounded-full bg-synse-primary/60'
                            : 'mt-2 size-2 rounded-full bg-synse-border'
                      }
                    />
                    <span className="w-px flex-1 bg-synse-border" aria-hidden />
                  </div>

                  <div className="min-w-0 flex-1 pb-4">
                    <p
                      className={
                        eAgora
                          ? 'truncate text-sm font-semibold text-synse-text'
                          : 'truncate text-sm text-synse-text'
                      }
                    >
                      {nomeDoBloco(bloco)}
                    </p>
                    <p className="truncate text-xs text-synse-muted">
                      {rotuloDoTipo(bloco.kind)}
                      {!bloco.remind && ' · sem lembrete'}
                    </p>
                  </div>
                </li>
              )
            })}
          </ol>
        </section>
      )}

      <BotaoPapelDeParede meta={plano?.goal ?? null} blocos={blocos} />

      <Blocos blocos={blocos} />

      {/*
        O que o aviso depende para chegar. Dito aqui, perto de onde a pessoa
        liga o lembrete, e não escondido numa tela de ajustes — prometer aviso
        que não sai é pior que não prometer.
      */}
      {comLembrete > 0 && (
        <p className="flex items-start gap-2 rounded-2xl border border-synse-border bg-synse-surface-2 p-3 text-xs text-synse-muted">
          <Bell className="mt-0.5 size-3.5 shrink-0 text-synse-primary" aria-hidden />
          <span>
            {comLembrete === 1 ? '1 bloco avisa você' : `${comLembrete} blocos avisam você`} no
            horário. Para o aviso chegar no celular, ative as notificações em Perfil →
            Notificações.
          </span>
        </p>
      )}
    </ColunaDeLeitura>
  )
}
