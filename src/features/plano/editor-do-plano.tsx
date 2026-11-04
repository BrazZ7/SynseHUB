'use client'

import { useState, useTransition } from 'react'
import { Bell, BellOff, Check, ChevronDown, Pencil, Plus, Target, Trash2, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apagarBlocoAction, salvarBlocoAction, salvarMetaAction } from '@/features/plano/actions'
import { DIAS, TIPOS, nomeDoBloco, rotuloDoTipo, rotuloDosDias } from '@/features/plano/state'
import { cn } from '@/lib/utils'
import type { RoutineBlock, RoutineKind, RoutinePlan } from '@/types/domain'

/**
 * ── A meta ──────────────────────────────────────────────────────────────────
 *
 * Uma frase, e as duas âncoras do dia. A frase vem primeiro na tela porque é
 * ela que dá sentido ao resto: uma lista de horários sem para quê é uma agenda,
 * não um plano.
 */
export function Meta({ plano }: { plano: RoutinePlan }) {
  const [editando, setEditando] = useState(!plano.goal)
  const [goal, setGoal] = useState(plano.goal ?? '')
  const [wakeAt, setWakeAt] = useState(plano.wakeAt ?? '')
  const [sleepAt, setSleepAt] = useState(plano.sleepAt ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, iniciar] = useTransition()

  const salvar = () => {
    setErro(null)
    iniciar(async () => {
      const r = await salvarMetaAction({
        goal: goal.trim() || null,
        wakeAt: wakeAt || null,
        sleepAt: sleepAt || null,
      })
      if (!r.ok) setErro(r.erro ?? 'Não deu para salvar.')
      else setEditando(false)
    })
  }

  if (!editando) {
    return (
      <section className="rounded-2xl border border-synse-border bg-synse-surface p-4 shadow-synse-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-synse-muted">
              <Target className="size-3.5 text-synse-primary" aria-hidden />
              Minha meta
            </p>
            <p className="mt-1 text-lg font-semibold text-synse-text">{plano.goal}</p>
            {(plano.wakeAt || plano.sleepAt) && (
              <p className="mt-1 text-xs text-synse-muted">
                {plano.wakeAt && `Acorda ${plano.wakeAt}`}
                {plano.wakeAt && plano.sleepAt && ' · '}
                {plano.sleepAt && `Dorme ${plano.sleepAt}`}
              </p>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setEditando(true)}>
            Mudar
          </Button>
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-3 rounded-2xl border border-synse-border bg-synse-surface p-4 shadow-synse-sm">
      <label className="block space-y-1">
        <span className="text-xs text-synse-muted">
          Sua meta, em uma frase
        </span>
        <Input
          value={goal}
          maxLength={120}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="Treinar 3× por semana e dormir 7 horas"
          aria-label="Sua meta"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-xs text-synse-muted">Acorda</span>
          <Input
            type="time"
            value={wakeAt}
            onChange={(e) => setWakeAt(e.target.value)}
            aria-label="Hora de acordar"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-synse-muted">Dorme</span>
          <Input
            type="time"
            value={sleepAt}
            onChange={(e) => setSleepAt(e.target.value)}
            aria-label="Hora de dormir"
          />
        </label>
      </div>

      {erro && <p className="text-xs text-synse-danger">{erro}</p>}

      <div className="flex gap-2">
        <Button className="flex-1" onClick={salvar} disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar'}
        </Button>
        {plano.goal && (
          <Button variant="ghost" onClick={() => setEditando(false)} disabled={salvando}>
            Cancelar
          </Button>
        )}
      </div>
    </section>
  )
}

/**
 * ── O editor de um bloco ────────────────────────────────────────────────────
 *
 * Tipo, hora, nome, dias e lembrete. Cinco campos, e nenhum deles opcional de
 * verdade — um bloco sem hora não existe, e um sem dia nunca acontece (o banco
 * recusa os dois, e aqui a tela não deixa chegar lá).
 */
function Formulario({
  bloco,
  aoFechar,
}: {
  bloco: (Omit<RoutineBlock, 'id'> & { id?: string | null }) | null
  aoFechar: () => void
}) {
  const [kind, setKind] = useState<RoutineKind>(bloco?.kind ?? 'AGUA')
  const [atTime, setAtTime] = useState(bloco?.atTime ?? '10:00')
  const [title, setTitle] = useState(bloco?.title ?? '')
  const [days, setDays] = useState<number[]>(bloco?.days ?? [1, 2, 3, 4, 5, 6, 7])
  const [remind, setRemind] = useState(bloco?.remind ?? true)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, iniciar] = useTransition()

  const alternarDia = (dia: number) =>
    setDays((atual) =>
      atual.includes(dia) ? atual.filter((d) => d !== dia) : [...atual, dia].sort((a, b) => a - b),
    )

  const salvar = () => {
    setErro(null)
    if (days.length === 0) {
      // O banco recusa, mas dizer aqui é mais rápido que a ida e a volta.
      setErro('Escolha pelo menos um dia.')
      return
    }
    iniciar(async () => {
      const r = await salvarBlocoAction({
        id: bloco?.id ?? null,
        kind,
        atTime,
        title: title.trim() || null,
        days,
        remind,
      })
      if (!r.ok) setErro(r.erro ?? 'Não deu para salvar.')
      else aoFechar()
    })
  }

  return (
    <div className="space-y-3 rounded-2xl border border-synse-primary/40 bg-synse-surface p-4 shadow-synse-sm">
      <div className="flex flex-wrap gap-2">
        {TIPOS.map((tipo) => (
          <button
            key={tipo.valor}
            type="button"
            onClick={() => setKind(tipo.valor)}
            aria-pressed={kind === tipo.valor}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              kind === tipo.valor
                ? 'border-synse-primary bg-synse-primary text-white'
                : 'border-synse-border text-synse-muted hover:border-synse-primary/50',
            )}
          >
            {tipo.rotulo}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-[auto_1fr] gap-3">
        <label className="block space-y-1">
          <span className="text-xs text-synse-muted">Hora</span>
          <Input
            type="time"
            value={atTime}
            onChange={(e) => setAtTime(e.target.value)}
            aria-label="Hora do bloco"
            className="w-32"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-synse-muted">Nome (opcional)</span>
          <Input
            value={title}
            maxLength={40}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={TIPOS.find((t) => t.valor === kind)?.padrao}
            aria-label="Nome do bloco"
          />
        </label>
      </div>

      <div className="space-y-1">
        <span className="text-xs text-synse-muted">Dias</span>
        <div className="flex gap-1.5">
          {DIAS.map((dia) => (
            <button
              key={dia.valor}
              type="button"
              onClick={() => alternarDia(dia.valor)}
              aria-pressed={days.includes(dia.valor)}
              aria-label={dia.nome}
              className={cn(
                'size-9 rounded-full border text-xs font-semibold transition-colors',
                days.includes(dia.valor)
                  ? 'border-synse-primary bg-synse-primary text-white'
                  : 'border-synse-border text-synse-muted hover:border-synse-primary/50',
              )}
            >
              {dia.letra}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setRemind((r) => !r)}
        aria-pressed={remind}
        className="flex w-full items-center gap-2 rounded-xl border border-synse-border px-3 py-2.5 text-left text-sm transition-colors hover:border-synse-primary/50"
      >
        {remind ? (
          <Bell className="size-4 shrink-0 text-synse-primary" aria-hidden />
        ) : (
          <BellOff className="size-4 shrink-0 text-synse-muted" aria-hidden />
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-synse-text">
            {remind ? 'Com lembrete' : 'Sem lembrete'}
          </span>
          <span className="block text-xs text-synse-muted">
            {remind ? 'Você é avisado na hora' : 'Aparece no plano, sem avisar'}
          </span>
        </span>
      </button>

      {erro && <p className="text-xs text-synse-danger">{erro}</p>}

      <div className="flex gap-2">
        <Button className="flex-1" onClick={salvar} disabled={salvando}>
          <Check className="size-4" aria-hidden />
          {salvando ? 'Salvando…' : 'Salvar'}
        </Button>
        <Button variant="ghost" onClick={aoFechar} disabled={salvando}>
          <X className="size-4" aria-hidden />
          Cancelar
        </Button>
      </div>
    </div>
  )
}

/** A lista de blocos, com o editor abrindo em cima do que foi tocado. */
export function Blocos({ blocos }: { blocos: readonly RoutineBlock[] }) {
  const [editando, setEditando] = useState<string | 'novo' | null>(null)
  const [apagando, iniciar] = useTransition()

  const apagar = (id: string) => {
    iniciar(async () => {
      await apagarBlocoAction(id)
    })
  }

  /*
   * ── Recolhido por padrão ──────────────────────────────────────────────────
   *
   * A linha do tempo acima já mostra o dia; esta lista mostra a rotina
   * **inteira**, de todos os dias, para editar. Numa rotina de "todo dia" as
   * duas são a mesma lista, e abertas elas deixavam a página com mais de
   * quatro mil pixels no celular — metade dela repetida. Visto no navegador.
   *
   * `<details>` e não estado: abrir e fechar é comportamento que o HTML já
   * tem, e vem com teclado, leitor de tela e o Ctrl+F que abre a seção ao
   * achar texto escondido.
   */
  return (
    <details className="group space-y-3" open={blocos.length === 0}>
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-2xl border border-synse-border bg-synse-surface px-4 py-3 text-sm font-semibold text-synse-text [&::-webkit-details-marker]:hidden">
        <Pencil className="size-4 shrink-0 text-synse-muted" aria-hidden />
        <span className="flex-1 text-left">Editar a rotina</span>
        <span className="text-xs font-normal text-synse-muted">
          {blocos.length} {blocos.length === 1 ? 'bloco' : 'blocos'}
        </span>
        <ChevronDown
          className="size-4 shrink-0 text-synse-muted transition-transform duration-200 group-open:rotate-180"
          aria-hidden
        />
      </summary>

      <div className="flex items-center justify-end pt-3">
        {editando !== 'novo' && (
          <Button variant="ghost" size="sm" onClick={() => setEditando('novo')}>
            <Plus className="size-4" aria-hidden />
            Acrescentar
          </Button>
        )}
      </div>

      {editando === 'novo' && <Formulario bloco={null} aoFechar={() => setEditando(null)} />}

      {blocos.length === 0 && editando !== 'novo' ? (
        <p className="rounded-2xl border border-dashed border-synse-border p-4 text-sm text-synse-muted">
          Sua rotina está vazia. Comece pelo que já é fixo — a hora de acordar, o expediente, o
          treino.
        </p>
      ) : (
        <ul className="space-y-2">
          {blocos.map((bloco) =>
            editando === bloco.id ? (
              <li key={bloco.id}>
                <Formulario bloco={bloco} aoFechar={() => setEditando(null)} />
              </li>
            ) : (
              <li
                key={bloco.id}
                className="flex items-center gap-3 rounded-2xl border border-synse-border bg-synse-surface p-3 shadow-synse-sm"
              >
                <button
                  type="button"
                  onClick={() => setEditando(bloco.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span className="w-14 shrink-0 text-sm font-semibold tabular-nums text-synse-primary">
                    {bloco.atTime}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-synse-text">
                      {nomeDoBloco(bloco)}
                    </span>
                    <span className="block truncate text-xs text-synse-muted">
                      {rotuloDoTipo(bloco.kind)} · {rotuloDosDias(bloco.days)}
                      {!bloco.remind && ' · sem lembrete'}
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => apagar(bloco.id)}
                  disabled={apagando}
                  aria-label={`Apagar ${nomeDoBloco(bloco)}`}
                  className="shrink-0 rounded-lg p-2 text-synse-muted transition-colors hover:text-synse-danger disabled:opacity-60"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </li>
            ),
          )}
        </ul>
      )}
    </details>
  )
}
