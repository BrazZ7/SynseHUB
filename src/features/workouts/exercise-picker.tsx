'use client'

import { Check, ChevronDown, Search, X } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'

import { exerciseOptionLabel, groupExercisesForSelect } from '@/features/workouts/group-exercises'
import { buscarExercicios } from '@/features/workouts/search-exercises'
import { cn } from '@/lib/utils'
import type { Exercise } from '@/types/domain'

/**
 * ── Escolher exercício, digitando ───────────────────────────────────────────
 *
 * Substitui o `<select>` de 132 opções. O campo de texto busca por nome,
 * apelido, aparelho e músculo; sem texto, a lista continua agrupada por região
 * e músculo, que é como um professor lê uma biblioteca de exercícios.
 *
 * ── Por que não é um `<select>` com busca ────────────────────────────────────
 *
 * O `<select>` nativo não filtra: as 132 opções estão todas lá, e a única
 * busca é a do navegador, que casa só o começo do nome e não conhece apelido.
 * Era isso que fazia "extensora" não achar a cadeira extensora.
 *
 * ── O valor continua saindo num campo do formulário ──────────────────────────
 *
 * `parseWorkoutForm` recompõe as linhas juntando vetores por índice — cinco
 * `exerciseId`, cinco `sets`, cinco `reps`. Um campo oculto **sempre**
 * presente, mesmo vazio, é o que mantém as colunas alinhadas; um campo que
 * some quando nada foi escolhido deslocaria as séries de um exercício para
 * outro, em silêncio.
 */

type Props = {
  name: string
  exercicios: readonly Exercise[]
  defaultValue?: string
  /** Rótulo acessível — a linha não tem `<label>` visível. */
  rotulo: string
}

/** Quantos resultados a lista mostra por busca. */
const RESULTADOS = 30

/**
 * Altura máxima da lista, e o espaço que ela pede embaixo para caber.
 *
 * Medido no navegador: numa linha perto do fim do formulário, a lista abria
 * para baixo e sumia atrás da barra inferior fixa — o primeiro resultado
 * aparecia pela metade. Sem espaço embaixo, ela vira para cima.
 */
const ALTURA_DA_LISTA = 288
const FOLGA_DA_BARRA = 96

export function ExercisePicker({ name, exercicios, defaultValue = '', rotulo }: Props) {
  const [escolhido, setEscolhido] = useState(defaultValue)
  const [termo, setTermo] = useState('')
  const [aberto, setAberto] = useState(false)
  const [emFoco, setEmFoco] = useState(0)
  const [paraCima, setParaCima] = useState(false)

  const caixa = useRef<HTMLDivElement>(null)
  const campo = useRef<HTMLInputElement>(null)
  const listaId = useId()

  const porId = useMemo(() => new Map(exercicios.map((e) => [e.id, e])), [exercicios])
  const grupos = useMemo(() => groupExercisesForSelect(exercicios), [exercicios])

  /*
   * Com texto, a busca manda. Sem texto, a lista agrupada — e ela é achatada
   * aqui para que a navegação por seta ande por uma sequência só, em vez de
   * pular cabeçalho.
   */
  const resultados = useMemo(
    () =>
      termo.trim()
        ? buscarExercicios(exercicios, termo, RESULTADOS)
        : grupos.flatMap((grupo) => grupo.exercises),
    [exercicios, grupos, termo],
  )

  const rotuloDoGrupo = useMemo(() => {
    if (termo.trim()) return new Map<string, string>()
    const mapa = new Map<string, string>()
    for (const grupo of grupos) {
      const primeiro = grupo.exercises[0]
      if (primeiro) mapa.set(primeiro.id, grupo.label)
    }
    return mapa
  }, [grupos, termo])

  const selecionado = escolhido ? porId.get(escolhido) : undefined

  const fechar = useCallback(() => {
    setAberto(false)
    setTermo('')
    setEmFoco(0)
  }, [])

  const escolher = useCallback(
    (exercicio: Exercise) => {
      setEscolhido(exercicio.id)
      fechar()
    },
    [fechar],
  )

  // Clique fora fecha. Sem isto, abrir a segunda linha deixaria a primeira
  // aberta, e duas listas de 132 itens disputariam a tela.
  useEffect(() => {
    if (!aberto) return
    const aoClicar = (evento: MouseEvent) => {
      if (!caixa.current?.contains(evento.target as Node)) fechar()
    }
    document.addEventListener('mousedown', aoClicar)
    return () => document.removeEventListener('mousedown', aoClicar)
  }, [aberto, fechar])

  useEffect(() => {
    if (!aberto) return
    campo.current?.focus()

    const caixaAgora = caixa.current?.getBoundingClientRect()
    if (!caixaAgora) return
    const espacoAbaixo = window.innerHeight - caixaAgora.bottom - FOLGA_DA_BARRA
    // Só vira para cima se lá em cima couber melhor: numa tela curta, virar
    // trocaria um corte por outro.
    setParaCima(espacoAbaixo < ALTURA_DA_LISTA && caixaAgora.top > espacoAbaixo)
  }, [aberto])

  const aoTeclar = (evento: React.KeyboardEvent) => {
    if (evento.key === 'Escape') {
      evento.preventDefault()
      fechar()
      return
    }
    if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') {
      evento.preventDefault()
      const passo = evento.key === 'ArrowDown' ? 1 : -1
      setEmFoco((atual) => {
        const proximo = atual + passo
        if (proximo < 0) return resultados.length - 1
        if (proximo >= resultados.length) return 0
        return proximo
      })
      return
    }
    if (evento.key === 'Enter') {
      evento.preventDefault()
      const alvo = resultados[emFoco]
      if (alvo) escolher(alvo)
    }
  }

  return (
    <div ref={caixa} className="relative">
      {/*
        O que o formulário envia. Sempre presente, mesmo vazio — vide o
        comentário no topo do arquivo.
      */}
      <input type="hidden" name={name} value={escolhido} />

      {aberto ? (
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-synse-muted"
            aria-hidden
          />
          <input
            ref={campo}
            type="text"
            role="combobox"
            aria-expanded
            aria-controls={listaId}
            aria-autocomplete="list"
            aria-label={`${rotulo} — buscar por nome, apelido ou aparelho`}
            value={termo}
            onChange={(evento) => {
              setTermo(evento.target.value)
              setEmFoco(0)
            }}
            onKeyDown={aoTeclar}
            placeholder="extensora, pulley frente, peito…"
            className="flex h-10 w-full rounded-lg border border-synse-primary bg-synse-surface pl-9 pr-3 text-sm text-synse-text outline-none ring-2 ring-synse-primary/25 placeholder:text-synse-muted/70"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAberto(true)}
          aria-label={rotulo}
          className={cn(
            'flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-synse-border bg-synse-surface px-3 text-left text-sm transition-colors',
            'hover:border-synse-primary focus-visible:border-synse-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-synse-primary/25',
            selecionado ? 'text-synse-text' : 'text-synse-muted',
          )}
        >
          <span className="truncate">
            {selecionado ? exerciseOptionLabel(selecionado) : 'Escolher exercício…'}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {selecionado && (
              <X
                className="size-4 text-synse-muted transition-colors hover:text-synse-text"
                aria-hidden
                onClick={(evento) => {
                  // Limpar sem abrir a lista: quem errou a linha quer esvaziá-la.
                  evento.stopPropagation()
                  setEscolhido('')
                }}
              />
            )}
            <ChevronDown className="size-4 text-synse-muted" aria-hidden />
          </span>
        </button>
      )}

      {aberto && (
        <ul
          id={listaId}
          role="listbox"
          aria-label={rotulo}
          className={cn(
            'absolute z-20 max-h-72 w-full overflow-y-auto rounded-lg border border-synse-border bg-synse-surface py-1 shadow-synse',
            paraCima ? 'bottom-full mb-1' : 'mt-1',
          )}
        >
          {resultados.length === 0 ? (
            <li className="px-3 py-3 text-sm text-synse-muted">
              Nada encontrado para “{termo}”. Tente o nome do aparelho, ou o músculo.
            </li>
          ) : (
            resultados.map((exercicio, indice) => {
              const cabecalho = rotuloDoGrupo.get(exercicio.id)
              return (
                <li key={exercicio.id}>
                  {cabecalho && (
                    <p className="bg-synse-surface-2 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-synse-muted">
                      {cabecalho}
                    </p>
                  )}
                  <button
                    type="button"
                    role="option"
                    aria-selected={exercicio.id === escolhido}
                    onMouseEnter={() => setEmFoco(indice)}
                    onClick={() => escolher(exercicio)}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                      indice === emFoco ? 'bg-synse-surface-2' : 'bg-transparent',
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate text-synse-text">
                      {exerciseOptionLabel(exercicio)}
                    </span>
                    {exercicio.id === escolhido && (
                      <Check className="size-4 shrink-0 text-synse-primary" aria-hidden />
                    )}
                  </button>
                </li>
              )
            })
          )}
        </ul>
      )}
    </div>
  )
}
