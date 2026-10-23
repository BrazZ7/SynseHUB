'use client'

import { useId } from 'react'
import { ChevronDown, Loader2, SlidersHorizontal } from 'lucide-react'

import { Feedback } from '@/components/synse/form-field'
import { Switch } from '@/components/ui/switch'
import type { WorkoutPreferences } from '@/types/domain'

/**
 * ── Os ajustes do treino ────────────────────────────────────────────────────
 *
 * A porta que faltava para `saveWorkoutPreferencesAction`. As preferências
 * existiam no banco desde a 0026, com RLS e tudo, e não havia onde mexer.
 *
 * ── Quatro interruptores, e não seis ────────────────────────────────────────
 *
 * `WorkoutPreferences` tem seis campos. Só quatro viram controle aqui, e a
 * diferença é deliberada:
 *
 * `defaultRestSeconds` **não aparece** porque nada o lê. O engine monta o
 * descanso com `exercicio.restSeconds`, e `workout_exercises.rest_seconds` é
 * `not null default 60` desde a 0003 — não existe exercício sem descanso
 * prescrito, então o valor "padrão" nunca entra em jogo. Oferecer o controle
 * seria pôr na tela um número que a pessoa ajusta e que não muda nada; ele
 * continua guardado e viaja intacto nas gravações, esperando que o dia em que
 * alguém decida que o aluno pode sobrepor a prescrição do professor.
 *
 * Os outros cinco mexem em coisa real: descanso automático e avanço automático
 * no reducer, vibração e som no fim do descanso, Wake Lock na tela.
 *
 * ── Fechado por padrão ──────────────────────────────────────────────────────
 *
 * `<details>` e não um painel aberto: quem abriu esta tela veio treinar. Os
 * ajustes são para a primeira vez e para quando algo incomoda — ficar
 * ocupando meia tela acima do botão "Concluir série" seria cobrar de todos os
 * treinos o preço de uma decisão que se toma uma vez.
 */

type Chave = 'autoRest' | 'autoAdvance' | 'vibration' | 'sound' | 'keepScreenAwake'

const OPCOES: { chave: Chave; rotulo: string; frase: string }[] = [
  {
    chave: 'autoRest',
    rotulo: 'Descanso automático',
    frase: 'O cronômetro começa sozinho ao concluir a série.',
  },
  {
    chave: 'autoAdvance',
    rotulo: 'Avanço automático',
    frase: 'Acabou o descanso, a próxima série já começa.',
  },
  { chave: 'vibration', rotulo: 'Vibrar', frase: 'No fim do descanso e a cada série concluída.' },
  { chave: 'sound', rotulo: 'Som', frase: 'Dois toques quando o descanso termina.' },
  {
    chave: 'keepScreenAwake',
    rotulo: 'Manter a tela ligada',
    frase: 'A tela não apaga no meio da série. Gasta mais bateria.',
  },
]

export function AjustesDoTreino({
  preferencias,
  erro,
  gravando,
  onMudar,
  onLigarSom,
}: {
  preferencias: WorkoutPreferences
  erro: string | null
  gravando: boolean
  onMudar: (parcial: Partial<WorkoutPreferences>) => void
  /**
   * Chamado **dentro do toque** que liga o som. O navegador só libera áudio
   * depois de um gesto, e o fim do descanso não é um.
   */
  onLigarSom: () => void
}) {
  const id = useId()

  return (
    <details className="group rounded-2xl border border-synse-border bg-synse-surface shadow-synse-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 p-4 text-sm font-medium text-synse-text">
        <SlidersHorizontal className="size-4 text-synse-muted" aria-hidden />
        Ajustes do treino
        {gravando && <Loader2 className="size-3.5 animate-spin text-synse-muted" aria-hidden />}
        <ChevronDown
          className="ml-auto size-4 text-synse-muted transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>

      <div className="space-y-1 border-t border-synse-border px-4 pb-4 pt-3">
        {erro && <Feedback tone="error" message={erro} />}

        {OPCOES.map(({ chave, rotulo, frase }) => (
          <div key={chave} className="flex items-center justify-between gap-4 py-2.5">
            <div className="min-w-0">
              <label htmlFor={`${id}-${chave}`} className="text-sm font-medium text-synse-text">
                {rotulo}
              </label>
              <p className="text-xs text-synse-muted">{frase}</p>
            </div>
            <Switch
              id={`${id}-${chave}`}
              checked={preferencias[chave]}
              onCheckedChange={(ligado) => {
                if (chave === 'sound' && ligado) onLigarSom()
                onMudar({ [chave]: ligado })
              }}
            />
          </div>
        ))}

        <p className="pt-1 text-xs text-synse-muted">
          Valem para os próximos treinos, neste e em qualquer aparelho.
        </p>
      </div>
    </details>
  )
}
