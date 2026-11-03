'use client'

import { useState, useTransition } from 'react'
import { CalendarPlus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { marcarTreinoDoEsquadraoAction } from '@/features/squad/actions'

/**
 * Marcar treino — e, com a ficha, "enviar treino".
 *
 * ── Fechado até alguém querer ───────────────────────────────────────────────
 *
 * Um formulário de três campos aberto no meio do lobby empurra para baixo as
 * duas coisas que a pessoa veio ver: quem está lá e o que já está marcado.
 * Ele abre no toque.
 *
 * ── Por que `datetime-local` e não um calendário próprio ────────────────────
 *
 * O seletor nativo do celular é melhor que qualquer um que eu escreveria: já
 * está no idioma do aparelho, já é acessível, e a pessoa já sabe usar. O que
 * o campo nativo não faz é fuso — o valor sai sem ele, e por isso vira ISO
 * aqui com o fuso do aparelho, que é onde a pessoa está.
 */
export function MarcarTreino({
  squadId,
  fichas,
}: {
  squadId: string
  /** As fichas que a pessoa pode mandar: as da academia dela. */
  fichas: ReadonlyArray<{ id: string; nome: string }>
}) {
  const [aberto, setAberto] = useState(false)
  const [quando, setQuando] = useState('')
  const [titulo, setTitulo] = useState('')
  const [ficha, setFicha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [gravando, iniciar] = useTransition()

  const enviar = () => {
    setErro(null)
    if (!quando) {
      setErro('Escolha o dia e a hora.')
      return
    }

    iniciar(async () => {
      const resposta = await marcarTreinoDoEsquadraoAction({
        squadId,
        // `datetime-local` devolve "2026-11-05T19:00", sem fuso: o `Date` o lê
        // no fuso do aparelho, que é onde quem marcou está.
        startsAt: new Date(quando).toISOString(),
        title: titulo.trim() || null,
        workoutPlanId: ficha || null,
      })

      if (!resposta.ok) {
        setErro(resposta.erro ?? 'Não deu para marcar.')
        return
      }
      setAberto(false)
      setQuando('')
      setTitulo('')
      setFicha('')
    })
  }

  if (!aberto) {
    return (
      <Button variant="outline" className="w-full" onClick={() => setAberto(true)}>
        <CalendarPlus className="size-4" aria-hidden />
        Marcar treino
      </Button>
    )
  }

  return (
    <section className="space-y-3 rounded-2xl border border-synse-border bg-synse-surface p-4 shadow-synse-sm">
      <p className="text-sm font-semibold text-synse-text">Marcar treino</p>

      <label className="block space-y-1">
        <span className="text-xs text-synse-muted">Quando</span>
        <Input
          type="datetime-local"
          value={quando}
          onChange={(e) => setQuando(e.target.value)}
          aria-label="Dia e hora do treino"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs text-synse-muted">O que vai ser (opcional)</span>
        <Input
          value={titulo}
          maxLength={60}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Perna, como sempre"
        />
      </label>

      {fichas.length > 0 && (
        <label className="block space-y-1">
          <span className="text-xs text-synse-muted">Mandar uma ficha junto (opcional)</span>
          <select
            value={ficha}
            onChange={(e) => setFicha(e.target.value)}
            className="h-10 w-full rounded-xl border border-synse-border bg-synse-surface px-3 text-sm text-synse-text"
          >
            <option value="">Nenhuma</option>
            {fichas.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        </label>
      )}

      {erro && <p className="text-xs text-synse-danger">{erro}</p>}

      <div className="flex gap-2">
        <Button className="flex-1" onClick={enviar} disabled={gravando}>
          {gravando ? 'Marcando…' : 'Marcar'}
        </Button>
        <Button variant="ghost" onClick={() => setAberto(false)} disabled={gravando}>
          Cancelar
        </Button>
      </div>
    </section>
  )
}
