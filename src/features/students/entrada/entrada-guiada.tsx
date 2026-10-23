'use client'

import { useRouter } from 'next/navigation'
import { useActionState, useEffect, useRef, useState, useTransition } from 'react'
import { ArrowLeft, Check } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DIAS_POSSIVEIS,
  EXPERIENCIAS,
  OBJETIVOS,
  estadoInicialDaEntrada,
} from '@/features/students/entrada/state'
import { pularEntradaAction, responderEntradaAction } from '@/features/students/entrada/actions'
import { cn } from '@/lib/utils'
import type { StudentExperience, StudentGoal, StudentIntake } from '@/types/domain'

/**
 * ── A entrada guiada ─────────────────────────────────────────────────────────
 *
 * Três perguntas, um toque cada: objetivo, experiência, dias por semana. É o
 * que o planejamento semanal e o resumo semanal vão consumir, e é por isso que
 * esta tela vem antes dos dois.
 *
 * ── Por que avança sozinha ───────────────────────────────────────────────────
 *
 * Escolher e depois tocar em "continuar" dobra o número de toques sem
 * acrescentar informação nenhuma: não há como escolher duas coisas no mesmo
 * passo, então a escolha já é a confirmação. O que a pessoa perde com isso é
 * poder revisar antes de enviar — e é por isso que existe a seta de voltar, e
 * por que a tela reabre com as respostas marcadas para corrigir.
 *
 * ── "Responder depois" fica visível o tempo todo ─────────────────────────────
 *
 * Não escondido num canto. Uma boa-vinda que a pessoa não consegue fechar é um
 * obstáculo, e a 0063 guarda a recusa justamente para não perguntar de novo a
 * cada abertura do app.
 */

type Passo = 0 | 1 | 2

export function EntradaGuiada({ intake }: { intake: StudentIntake | null }) {
  const router = useRouter()
  const [estado, enviar] = useActionState(responderEntradaAction, estadoInicialDaEntrada)
  const [pulando, iniciarPular] = useTransition()

  const [objetivo, setObjetivo] = useState<StudentGoal | null>(intake?.goal ?? null)
  const [experiencia, setExperiencia] = useState<StudentExperience | null>(
    intake?.experience ?? null,
  )
  const [passo, setPasso] = useState<Passo>(0)

  const formRef = useRef<HTMLFormElement>(null)
  const diasRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (estado.status === 'success') router.replace('/app')
  }, [estado.status, router])

  /*
   * O envio é de um formulário de verdade, com os três campos ocultos: a
   * action recebe `FormData` como todas as outras do projeto, e a tela
   * continua funcionando se o JavaScript falhar no meio do caminho.
   */
  function responder(dias: number) {
    if (!objetivo || !experiencia || !diasRef.current || !formRef.current) return
    diasRef.current.value = String(dias)
    formRef.current.requestSubmit()
  }

  const jaRespondeu = !!intake?.completedAt

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          {passo > 0 && (
            <button
              type="button"
              onClick={() => setPasso((p) => (p - 1) as Passo)}
              className="-ml-1 rounded-lg p-1 text-synse-muted hover:text-synse-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-synse-primary"
              aria-label="Voltar ao passo anterior"
            >
              <ArrowLeft className="size-5" aria-hidden />
            </button>
          )}
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-synse-muted">
            {passo + 1} de 3
          </p>
        </div>
        <h1 className="text-2xl font-semibold text-synse-text">
          {jaRespondeu ? 'Ajustar o que você quer' : 'Vamos montar seu Synse'}
        </h1>
        <p className="text-sm text-synse-muted">
          Três perguntas rápidas. Seu professor usa isso para montar o treino.
        </p>
      </header>

      <form ref={formRef} action={enviar}>
        <input type="hidden" name="goal" value={objetivo ?? ''} />
        <input type="hidden" name="experience" value={experiencia ?? ''} />
        <input type="hidden" name="daysPerWeek" ref={diasRef} defaultValue="" />

        {passo === 0 && (
          <Pergunta titulo="O que você quer alcançar?">
            {OBJETIVOS.map((opcao) => (
              <Opcao
                key={opcao.valor}
                rotulo={opcao.rotulo}
                ajuda={opcao.ajuda}
                marcada={objetivo === opcao.valor}
                aoEscolher={() => {
                  setObjetivo(opcao.valor)
                  setPasso(1)
                }}
              />
            ))}
          </Pergunta>
        )}

        {passo === 1 && (
          <Pergunta titulo="Como está sua experiência?">
            {EXPERIENCIAS.map((opcao) => (
              <Opcao
                key={opcao.valor}
                rotulo={opcao.rotulo}
                ajuda={opcao.ajuda}
                marcada={experiencia === opcao.valor}
                aoEscolher={() => {
                  setExperiencia(opcao.valor)
                  setPasso(2)
                }}
              />
            ))}
          </Pergunta>
        )}

        {passo === 2 && (
          <Pergunta titulo="Quantos dias por semana dá para treinar?">
            <div className="grid grid-cols-4 gap-2">
              {DIAS_POSSIVEIS.map((dias) => (
                <button
                  key={dias}
                  type="button"
                  onClick={() => responder(dias)}
                  className={cn(
                    'rounded-xl border border-synse-border bg-synse-surface py-4 text-lg font-semibold tabular-nums text-synse-text',
                    'hover:border-synse-primary hover:bg-synse-primary/5',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-synse-primary',
                    intake?.daysPerWeek === dias && 'border-synse-primary bg-synse-primary/10',
                  )}
                >
                  {dias}
                </button>
              ))}
            </div>
            <p className="text-xs text-synse-muted">
              Vale o que cabe na sua semana de verdade. Dá para mudar depois.
            </p>
          </Pergunta>
        )}
      </form>

      {estado.status === 'error' && (
        <p role="alert" className="text-sm text-synse-danger">
          {estado.erro}
        </p>
      )}

      {/*
       * Fora do formulário de cima: dois `action` diferentes no mesmo
       * formulário não existem, e aninhar formulário é HTML inválido.
       */}
      <div className="flex justify-center border-t border-synse-border pt-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pulando}
          onClick={() =>
            iniciarPular(async () => {
              const resultado = await pularEntradaAction()
              // Navega só no sucesso: senão a recusa não foi gravada e a
              // tela voltaria na próxima abertura, sem explicação.
              if (resultado.status === 'success') router.replace('/app')
            })
          }
          className="text-synse-muted"
        >
          {pulando ? 'Um instante…' : 'Responder depois'}
        </Button>
      </div>
    </div>
  )
}

function Pergunta({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="mb-3 text-base font-medium text-synse-text">{titulo}</legend>
      {children}
    </fieldset>
  )
}

function Opcao({
  rotulo,
  ajuda,
  marcada,
  aoEscolher,
}: {
  rotulo: string
  ajuda: string
  marcada: boolean
  aoEscolher: () => void
}) {
  return (
    <button
      type="button"
      onClick={aoEscolher}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl border border-synse-border bg-synse-surface p-4 text-left',
        'hover:border-synse-primary hover:bg-synse-primary/5',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-synse-primary',
        marcada && 'border-synse-primary bg-synse-primary/10',
      )}
    >
      <span className="flex-1">
        <span className="block font-medium text-synse-text">{rotulo}</span>
        <span className="block text-sm text-synse-muted">{ajuda}</span>
      </span>
      {marcada && <Check className="size-5 shrink-0 text-synse-primary" aria-hidden />}
    </button>
  )
}
