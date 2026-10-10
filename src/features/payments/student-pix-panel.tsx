'use client'

import { Copy, QrCode } from 'lucide-react'
import { useActionState, useState } from 'react'

import { PaymentStatus } from '@/components/synse/status-badge'
import { Button } from '@/components/ui/button'
import { createStudentPixAction } from '@/features/payments/student-actions'
import { initialPaymentState } from '@/features/payments/state'
import { daysOverdue, formatCurrency, formatDate } from '@/lib/utils'
import type { ChargeStatus } from '@/types/domain'

export type Impedimento = 'sem-pix' | 'sem-provedor' | null

const MOTIVO: Record<NonNullable<Impedimento>, string> = {
  'sem-pix':
    'O provedor configurado pela sua academia não oferece PIX. Procure a recepção para as formas de pagamento disponíveis.',
  'sem-provedor':
    'O pagamento pelo app está desligado enquanto conectamos o novo provedor. Sua mensalidade continua valendo — combine com a recepção da sua academia como pagar.',
}

type Props = {
  chargeId: string
  amount: number
  dueDate: string
  description: string
  status: ChargeStatus
  /** Por que não dá para pagar agora. `null` quando dá. */
  impedimento: Impedimento
}

/**
 * Pagamento da mensalidade pelo Synse App.
 *
 * O app apenas *solicita* o PIX. A confirmação nunca vem do navegador: o
 * status só muda quando o provedor notifica o webhook.
 *
 * ── Dois impedimentos, e não um ─────────────────────────────────────────────
 *
 * Antes havia só `pixSupported`, e ele respondia à pergunta errada. O provedor
 * simulado **aceita PIX**, então o botão aparecia ativo, gerava um BR Code
 * terminado em `6304MOCK` e mandava a pessoa colar no banco. A pessoa culpa o
 * próprio banco antes de culpar o app.
 *
 * `sem-pix` é "a academia usa um provedor que não faz PIX" — a pessoa procura
 * a recepção e paga de outro jeito. `sem-provedor` é "o Synse está trocando de
 * provedor de pagamento" — não é problema da academia, e dizer que é mandaria
 * a pessoa reclamar com quem não pode resolver.
 */
export function StudentPixPanel({
  chargeId,
  amount,
  dueDate,
  description,
  status,
  impedimento,
}: Props) {
  const [state, formAction, pending] = useActionState(createStudentPixAction, initialPaymentState)
  const [copied, setCopied] = useState(false)

  const overdue = status === 'OVERDUE'
  const late = daysOverdue(dueDate)

  async function copyPix() {
    if (!state.pix) return
    try {
      await navigator.clipboard.writeText(state.pix.payload)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* Sem área de transferência: o código continua visível para cópia manual. */
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-synse-border bg-synse-surface shadow-synse-sm">
      <div className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs capitalize text-synse-muted">{description}</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-synse-text">
              {formatCurrency(amount)}
            </p>
            <p className={overdue ? 'text-sm text-synse-danger' : 'text-sm text-synse-muted'}>
              {overdue ? `${late} dias em atraso` : `Vence ${formatDate(dueDate)}`}
            </p>
          </div>
          <PaymentStatus status={status} />
        </div>

        {!state.pix && (
          <form action={formAction}>
            <input type="hidden" name="chargeId" value={chargeId} />
            <Button
              type="submit"
              variant="gradient"
              size="lg"
              className="w-full"
              disabled={pending || impedimento !== null}
            >
              <QrCode className="size-4" />
              {pending ? 'Gerando PIX…' : impedimento === null ? 'PAGAR AGORA' : 'PIX indisponível'}
            </Button>
          </form>
        )}

        {impedimento && (
          <p className="text-xs text-synse-muted">{MOTIVO[impedimento]}</p>
        )}

        {state.status === 'error' && (
          <p role="alert" className="text-sm text-synse-danger">
            {state.message}
          </p>
        )}

        {state.pix && (
          <div className="space-y-3 animate-fade-in">
            <p className="break-all rounded-lg bg-synse-surface-2 p-3 font-mono text-[11px] leading-relaxed text-synse-text">
              {state.pix.payload}
            </p>
            <Button onClick={copyPix} className="w-full">
              <Copy className="size-4" />
              {copied ? 'Código copiado' : 'Copiar PIX copia e cola'}
            </Button>
            <p className="text-xs text-synse-muted">
              Assim que o banco confirmar, o pagamento aparece como aprovado aqui e o recibo fica
              disponível no histórico.
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
