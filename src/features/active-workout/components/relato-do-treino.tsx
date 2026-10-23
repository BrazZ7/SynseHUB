'use client'

import { useState } from 'react'

import type { RelatoDoTreino } from '@/features/active-workout/state'
import { cn } from '@/lib/utils'

/**
 * ── Como foi o treino, no resumo ─────────────────────────────────────────────
 *
 * O professor vê o que o aluno fez: séries, carga, repetições, duração. Não vê
 * como foi. A diferença entre "4×10 com 60 kg" e "4×10 com 60 kg e o ombro doeu
 * na terceira" é a diferença entre ajustar na semana que vem e ajustar depois
 * da lesão.
 *
 * ── Um campo obrigatório, e só um ────────────────────────────────────────────
 *
 * Esta tela aparece no instante em que a pessoa acabou de treinar e quer
 * guardar o celular. Cada campo exigido aqui é gente que não responde — e
 * relato que ninguém manda não ajuda professor nenhum.
 *
 * Então: um toque na escala e está feito. Desconforto e observação só aparecem
 * **depois** do primeiro toque, porque antes dele a pergunta ainda não foi
 * aceita e três campos de uma vez parecem formulário.
 *
 * ── Dor não é intensidade ────────────────────────────────────────────────────
 *
 * Por isso o desconforto é marcação à parte, e não o topo da escala. Um treino
 * leve pode machucar o joelho. Se dor fosse "10", quem sentiu dor num treino
 * tranquilo teria de escolher entre relatar a dor e relatar que foi tranquilo —
 * e escolheria errado, porque a escala é o campo obrigatório.
 */

const ESCALA = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const

/** O mesmo teto do `check` da coluna (0062) e do schema de validação. */
const LIMITE_DA_OBSERVACAO = 500

export function BlocoDeRelato({
  onChange,
}: {
  /**
   * Recebe o relato pronto, ou `null` enquanto não há esforço escolhido.
   *
   * Quem chama passa o `setState` direto. Ele é estável entre renderizações,
   * e é isso que deixa este componente avisar durante o evento em vez de num
   * `useEffect` com a função nas dependências — que reagendaria a cada
   * renderização do pai.
   */
  onChange: (relato: RelatoDoTreino | null) => void
}) {
  const [esforco, setEsforco] = useState<number | null>(null)
  const [desconforto, setDesconforto] = useState(false)
  const [observacao, setObservacao] = useState('')

  function avisar(proximo: {
    esforco?: number | null
    desconforto?: boolean
    observacao?: string
  }) {
    const e = proximo.esforco !== undefined ? proximo.esforco : esforco
    const d = proximo.desconforto !== undefined ? proximo.desconforto : desconforto
    const o = proximo.observacao !== undefined ? proximo.observacao : observacao
    onChange(e === null ? null : { effort: e, discomfort: d, note: o.trim() || null })
  }

  return (
    <div className="mt-6 border-t border-white/15 pt-5">
      <fieldset>
        <legend className="text-sm font-medium text-white">Como foi este treino?</legend>
        <p className="mt-1 text-xs text-white/60">
          Seu professor vê isso para ajustar a carga. É opcional.
        </p>

        <div className="mt-3 flex gap-1" role="none">
          {ESCALA.map((nota) => (
            <label
              key={nota}
              className={cn(
                'flex-1 cursor-pointer rounded-lg py-2 text-center text-sm font-semibold tabular-nums',
                'bg-white/10 text-white/70 transition-colors',
                'hover:bg-white/20',
                /*
                 * `has-[:checked]` é o mesmo recurso que o formulário de
                 * inscrição usa: o rádio de verdade fica escondido e o estilo
                 * segue o estado dele. Com `<input>` real vêm as setas do
                 * teclado e o leitor de tela anunciando "3 de 10" — coisas que
                 * uma fileira de `<button>` não dá de graça.
                 */
                'has-[:checked]:bg-white has-[:checked]:text-synse-primary',
                'has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-white',
              )}
            >
              <input
                type="radio"
                name="esforco-do-treino"
                value={nota}
                className="sr-only"
                onChange={() => {
                  setEsforco(nota)
                  avisar({ esforco: nota })
                }}
              />
              {nota}
            </label>
          ))}
        </div>

        <div className="mt-2 flex justify-between text-[11px] text-white/50">
          {/* As âncoras são o que faz a escala significar algo sem explicação. */}
          <span>1 · tranquilo</span>
          <span>10 · no limite</span>
        </div>
      </fieldset>

      {esforco !== null && (
        <div className="mt-4 space-y-3">
          <label
            className={cn(
              'flex cursor-pointer items-center gap-3 rounded-xl bg-white/10 px-4 py-3 text-sm text-white',
              'has-[:checked]:bg-synse-warning/25 has-[:checked]:ring-1 has-[:checked]:ring-synse-warning/60',
              'has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-white',
            )}
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={desconforto}
              onChange={(evento) => {
                setDesconforto(evento.target.checked)
                avisar({ desconforto: evento.target.checked })
              }}
            />
            <span
              aria-hidden
              className={cn(
                'size-5 shrink-0 rounded-md border-2 border-white/50',
                desconforto && 'border-synse-warning bg-synse-warning',
              )}
            />
            Senti dor ou desconforto
          </label>

          <label className="block">
            <span className="text-xs text-white/60">Quer contar alguma coisa? (opcional)</span>
            <textarea
              value={observacao}
              maxLength={LIMITE_DA_OBSERVACAO}
              rows={2}
              onChange={(evento) => {
                setObservacao(evento.target.value)
                avisar({ observacao: evento.target.value })
              }}
              placeholder="Onde doeu, o que ficou difícil, o que mudaria…"
              className={cn(
                'mt-1 w-full resize-none rounded-xl bg-white/10 px-3 py-2 text-sm text-white',
                'placeholder:text-white/40',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
              )}
            />
          </label>
        </div>
      )}
    </div>
  )
}
