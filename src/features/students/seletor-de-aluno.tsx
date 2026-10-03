'use client'

import { Search, X } from 'lucide-react'
import { useEffect, useId, useRef, useState, useTransition } from 'react'

import { StudentAvatar } from '@/components/synse/student-avatar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { buscarAlunosAction } from '@/features/students/busca-de-aluno'
import type { AlunoEncontrado } from '@/features/students/busca-state'
import { cn } from '@/lib/utils'

/**
 * ── Escolher um aluno, em qualquer academia ─────────────────────────────────
 *
 * Substitui o `<select>` que cinco telas montavam a partir de `listStudents`.
 * Aquela lista para em 100 (`Math.min(100, …)` nos dois data sources), então
 * numa academia com 478 ativos quatro em cada cinco alunos não existiam para
 * a tela — e nada dizia isso. O nome só não estava lá.
 *
 * Aumentar o teto adiaria o problema e carregaria a academia inteira no HTML
 * de toda tela que escolhe aluno. A busca passou a acontecer no servidor,
 * onde os dados estão, e esta é a porta dela.
 *
 * ── O id vai num campo escondido ────────────────────────────────────────────
 *
 * O formulário continua enviando `studentId` como sempre, e as actions não
 * mudaram: elas conferem a academia e a RLS confere por cima. O que o
 * atendente lê é o nome; o que viaja é o id.
 *
 * ── Teclado, porque isto é tela de balcão ───────────────────────────────────
 *
 * Seta para baixo abre e desce, seta para cima sobe, Enter escolhe, Esc
 * fecha. O `<select>` que saiu dava isso de graça, e trocá-lo por uma lista
 * de `<div>`s sem teclado seria piorar para quem atende com as duas mãos
 * ocupadas. O padrão ARIA é o de combobox com listbox.
 */

/** Quanto esperar parar de digitar antes de ir ao servidor. */
const ESPERA_MS = 250

export function SeletorDeAluno({
  name = 'studentId',
  label = 'Aluno',
  inicial,
  somenteAtivos = true,
  excluir,
  anotacoes,
  erros,
  obrigatorio = true,
}: {
  name?: string
  label?: string
  /** Quem já vem escolhido: edição de plano, ou o `?aluno=` vindo da ficha. */
  inicial?: { id: string; name: string } | null
  somenteAtivos?: boolean
  /** Ids que não podem ser escolhidos — já reservados, já matriculados. */
  excluir?: string[]
  /** Recado por aluno, do tipo "já tem este treino". */
  anotacoes?: Record<string, string>
  erros?: string[]
  obrigatorio?: boolean
}) {
  const id = useId()
  const [escolhido, setEscolhido] = useState<{ id: string; name: string } | null>(inicial ?? null)
  const [termo, setTermo] = useState('')
  const [aberto, setAberto] = useState(false)
  const [alunos, setAlunos] = useState<AlunoEncontrado[]>([])
  const [total, setTotal] = useState(0)
  const [erroDaBusca, setErroDaBusca] = useState<string | null>(null)
  const [destacado, setDestacado] = useState(0)
  const [buscando, iniciarBusca] = useTransition()

  const caixa = useRef<HTMLDivElement>(null)
  const campo = useRef<HTMLInputElement>(null)

  const foraDaLista = new Set(excluir ?? [])
  const visiveis = alunos.filter((aluno) => !foraDaLista.has(aluno.id))

  // ── A busca ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!aberto) return

    /*
     * Espera parar de digitar. Sem isto, "Ana Cardoso" dispara onze consultas
     * e as respostas chegam fora de ordem — a lista pisca entre resultados de
     * "Ana C" e "Ana Car" conforme a rede decide.
     */
    const tempo = setTimeout(() => {
      iniciarBusca(async () => {
        const resultado = await buscarAlunosAction(termo, somenteAtivos)
        if (resultado.ok) {
          setAlunos(resultado.alunos)
          setTotal(resultado.total)
          setErroDaBusca(null)
        } else {
          setAlunos([])
          setErroDaBusca(resultado.erro)
        }
        setDestacado(0)
      })
    }, ESPERA_MS)

    return () => clearTimeout(tempo)
  }, [termo, aberto, somenteAtivos])

  // ── Fechar ao clicar fora ──────────────────────────────────────────────────
  useEffect(() => {
    if (!aberto) return
    const aoClicar = (evento: MouseEvent) => {
      if (!caixa.current?.contains(evento.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', aoClicar)
    return () => document.removeEventListener('mousedown', aoClicar)
  }, [aberto])

  function escolher(aluno: AlunoEncontrado) {
    setEscolhido({ id: aluno.id, name: aluno.name })
    setAberto(false)
    setTermo('')
  }

  function limpar() {
    setEscolhido(null)
    setTermo('')
    setAberto(true)
    campo.current?.focus()
  }

  function aoTeclar(evento: React.KeyboardEvent<HTMLInputElement>) {
    if (evento.key === 'ArrowDown') {
      evento.preventDefault()
      if (!aberto) return setAberto(true)
      setDestacado((atual) => Math.min(atual + 1, Math.max(visiveis.length - 1, 0)))
      return
    }
    if (evento.key === 'ArrowUp') {
      evento.preventDefault()
      setDestacado((atual) => Math.max(atual - 1, 0))
      return
    }
    if (evento.key === 'Enter' && aberto) {
      // Só engole o Enter quando há o que escolher: senão ele deixaria de
      // enviar o formulário, que é o que o Enter faz num campo de texto.
      const alvo = visiveis[destacado]
      if (!alvo) return
      evento.preventDefault()
      escolher(alvo)
      return
    }
    if (evento.key === 'Escape') setAberto(false)
  }

  const listaId = `${id}-lista`

  return (
    <div className="space-y-1.5" ref={caixa}>
      <Label htmlFor={`${id}-busca`}>{label}</Label>

      {/* O que o formulário envia. O nome é para quem lê; o id é o dado. */}
      <input type="hidden" name={name} value={escolhido?.id ?? ''} />

      {escolhido ? (
        <div className="flex items-center gap-2.5 rounded-lg border border-synse-border bg-synse-surface-2 px-3 py-2">
          <StudentAvatar name={escolhido.name} size="sm" />
          <span className="min-w-0 flex-1 truncate text-sm text-synse-text">{escolhido.name}</span>
          <button
            type="button"
            onClick={limpar}
            className="rounded p-1 text-synse-muted transition-colors hover:text-synse-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-synse-primary/40"
            aria-label={`Trocar ${escolhido.name} por outro aluno`}
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-synse-muted"
            aria-hidden
          />
          <Input
            id={`${id}-busca`}
            ref={campo}
            value={termo}
            onChange={(evento) => {
              setTermo(evento.target.value)
              setAberto(true)
            }}
            onFocus={() => setAberto(true)}
            onKeyDown={aoTeclar}
            placeholder="Buscar por nome ou Synse ID"
            className="pl-9"
            autoComplete="off"
            role="combobox"
            aria-expanded={aberto}
            aria-controls={listaId}
            aria-autocomplete="list"
            aria-required={obrigatorio}
          />

          {aberto && (
            <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-synse-border bg-synse-surface shadow-synse-lg">
              <ul
                id={listaId}
                role="listbox"
                aria-label="Alunos encontrados"
                className="max-h-72 overflow-y-auto"
              >
                {visiveis.map((aluno, indice) => (
                  <li key={aluno.id} role="option" aria-selected={indice === destacado}>
                    <button
                      type="button"
                      onClick={() => escolher(aluno)}
                      onMouseEnter={() => setDestacado(indice)}
                      className={cn(
                        'flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors',
                        indice === destacado ? 'bg-synse-surface-2' : 'bg-transparent',
                      )}
                    >
                      <StudentAvatar name={aluno.name} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-synse-text">{aluno.name}</span>
                        <span className="block truncate text-xs text-synse-muted">
                          {aluno.synseId}
                          {aluno.planName && ` · ${aluno.planName}`}
                          {anotacoes?.[aluno.id] && ` · ${anotacoes[aluno.id]}`}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}

                {visiveis.length === 0 && (
                  <li className="px-3 py-3 text-sm text-synse-muted">
                    {buscando
                      ? 'Buscando…'
                      : (erroDaBusca ??
                        (termo
                          ? 'Nenhum aluno com esse nome.'
                          : 'Digite para buscar entre todos os alunos.'))}
                  </li>
                )}
              </ul>

              {/*
                Dizer que há mais. O `<select>` que saiu cortava em silêncio, e
                o silêncio era o defeito — quem não achava o aluno concluía que
                ele não estava cadastrado.
              */}
              {total > visiveis.length && (
                <p className="border-t border-synse-border px-3 py-2 text-xs text-synse-muted">
                  Mostrando {visiveis.length} de {total}. Refine a busca para encontrar quem falta.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {erros?.length ? <p className="text-xs text-synse-danger">{erros[0]}</p> : null}
    </div>
  )
}
