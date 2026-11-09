'use client'

import { useState, useTransition } from 'react'
import { Check, MessageSquareText, TriangleAlert } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { marcarFeedbackVistoAction } from '@/features/workouts/actions'
import { cn, formatDate } from '@/lib/utils'
import type { WorkoutFeedbackEntry } from '@/types/domain'

/**
 * ── O que o aluno disse sobre o treino ───────────────────────────────────────
 *
 * Atrás de `workouts:read`, e a escolha dessa permissão é deliberada: quem
 * recebe o recado é quem ajusta a carga. A recepção não tem `workouts:read` e
 * não deve ler "senti dor no ombro"; a nutricionista tem `assessments:read`
 * mas não `workouts:read`, e dor em exercício não é assunto dela.
 *
 * ── O desconforto vem primeiro, e destacado ──────────────────────────────────
 *
 * Não por ordem de chegada: por consequência. Esforço 9 num treino pesado é
 * informação; dor é a linha que alguém precisa ver hoje. Por isso ela sobe ao
 * topo e muda de cor, e por isso a 0062 tem índice parcial só para ela.
 */

/** Acima disto a carga provavelmente está alta demais. */
const ESFORCO_ALTO = 9
/** Abaixo disto, de menos. */
const ESFORCO_BAIXO = 3

export function FeedbackDoAluno({
  relatos,
  studentId,
  podeMarcar,
}: {
  relatos: WorkoutFeedbackEntry[]
  studentId: string
  /** `workouts:write`. Sem ele a lista é só leitura. */
  podeMarcar: boolean
}) {
  /*
   * Os marcados nesta visita, acima do que veio do servidor.
   *
   * O estado mora aqui, e não em cada linha, porque o selo "N novos" é do
   * cabeçalho: com a marcação presa dentro da linha, ela virava "Visto" e o
   * selo continuava contando — medido no navegador, e é o tipo de incoerência
   * que faz alguém procurar um relato que já foi tratado.
   *
   * Antes de qualquer `return`: a lista vazia sai depois do hook.
   */
  const [vistosAgora, setVistosAgora] = useState<ReadonlySet<string>>(new Set())

  if (relatos.length === 0) return null

  /*
   * Desconforto não visto primeiro, depois o resto por data. `sort` sobre uma
   * cópia: a lista vem do servidor e ordenar no lugar mexeria no array que o
   * React recebeu como prop.
   */
  const ordenados = [...relatos].sort((a, b) => {
    const urgente = (r: WorkoutFeedbackEntry) => (r.discomfort && !r.seenAt ? 0 : 1)
    return urgente(a) - urgente(b) || b.performedAt.localeCompare(a.performedAt)
  })

  const pendentes = relatos.filter((r) => !r.seenAt && !vistosAgora.has(r.sessionId)).length

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <MessageSquareText className="size-4 text-synse-muted" aria-hidden />O que o aluno
            relatou
          </CardTitle>
          {pendentes > 0 && (
            <Badge variant="primary">
              {pendentes} {pendentes > 1 ? 'novos' : 'novo'}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {ordenados.map((relato) => (
          <Relato
            key={relato.sessionId}
            relato={relato}
            studentId={studentId}
            podeMarcar={podeMarcar}
            visto={relato.seenAt !== null || vistosAgora.has(relato.sessionId)}
            aoMarcar={() => setVistosAgora((atual) => new Set(atual).add(relato.sessionId))}
          />
        ))}
      </CardContent>
    </Card>
  )
}

function Relato({
  relato,
  studentId,
  podeMarcar,
  visto,
  aoMarcar,
}: {
  relato: WorkoutFeedbackEntry
  studentId: string
  podeMarcar: boolean
  visto: boolean
  aoMarcar: () => void
}) {
  const [enviando, iniciarTransicao] = useTransition()

  return (
    <div
      className={cn(
        'rounded-xl border p-3',
        relato.discomfort
          ? 'border-synse-warning/50 bg-synse-warning/10'
          : 'border-synse-border bg-synse-surface-2',
        visto && 'opacity-60',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {relato.discomfort && (
          <span className="flex items-center gap-1 text-xs font-semibold text-synse-warning">
            <TriangleAlert className="size-3.5" aria-hidden />
            Dor ou desconforto
          </span>
        )}
        <span className="text-sm font-semibold tabular-nums text-synse-text">
          Esforço {relato.effort}/10
        </span>
        {relato.effort >= ESFORCO_ALTO && (
          <span className="text-xs text-synse-muted">· perto do limite</span>
        )}
        {relato.effort <= ESFORCO_BAIXO && (
          <span className="text-xs text-synse-muted">· sobrou fôlego</span>
        )}
      </div>

      <p className="mt-1 text-xs text-synse-muted">
        {relato.planName ?? 'Treino sem plano'} · {formatDate(relato.performedAt)}
      </p>

      {relato.note && (
        /*
         * `whitespace-pre-line` e não `pre-wrap`: a pessoa digitou num celular
         * e as quebras de linha dela importam, mas preservar cada espaço
         * deixaria o texto desalinhado por toque acidental na barra.
         */
        <p className="mt-2 whitespace-pre-line text-sm text-synse-text">{relato.note}</p>
      )}

      {podeMarcar && !visto && (
        <Button
          variant="ghost"
          size="sm"
          disabled={enviando}
          className="mt-2 h-auto p-0 text-xs"
          onClick={() =>
            iniciarTransicao(async () => {
              const resultado = await marcarFeedbackVistoAction(relato.sessionId, studentId)
              /*
               * Só marca na tela se o servidor confirmou. Marcar antes faria o
               * aviso sumir para quem não tem permissão de escrita — e voltar
               * na próxima abertura, sem explicação.
               */
              if (resultado.ok) aoMarcar()
            })
          }
        >
          <Check className="size-3.5" aria-hidden />
          Marcar como visto
        </Button>
      )}

      {visto && <p className="mt-2 text-xs text-synse-muted">Visto</p>}
    </div>
  )
}
