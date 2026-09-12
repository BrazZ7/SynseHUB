'use client'

import { Copy, MessageSquare, QrCode, Send, Wallet } from 'lucide-react'
import { useActionState, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  createPixChargeAction,
  registerCollectionAttemptAction,
  registerManualPaymentAction,
} from '@/features/payments/actions'
import { initialPaymentState } from '@/features/payments/state'
import { formatCurrency } from '@/lib/utils'

type Props = {
  chargeId: string
  studentName: string
  amount: number
}

/**
 * Ações de recuperação de uma cobrança em atraso.
 * Cada uma dispara uma server action que revalida a permissão no servidor.
 */
export function OverdueActionsCell({ chargeId, studentName, amount }: Props) {
  const [pixState, pixAction, pixPending] = useActionState(createPixChargeAction, initialPaymentState)
  const [settleState, settleAction, settlePending] = useActionState(
    registerManualPaymentAction,
    initialPaymentState,
  )
  const [reminderState, reminderAction, reminderPending] = useActionState(
    registerCollectionAttemptAction,
    initialPaymentState,
  )
  const [pixOpen, setPixOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const busy = pixPending || settlePending || reminderPending

  async function copyPix() {
    if (!pixState.pix) return
    try {
      await navigator.clipboard.writeText(pixState.pix.payload)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* Área de transferência indisponível: o código segue visível na tela. */
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={busy}>
            {busy ? 'Aguarde…' : 'Cobrar'}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{studentName}</DropdownMenuLabel>
          <DropdownMenuSeparator />

          <form
            action={(formData) => {
              setPixOpen(true)
              pixAction(formData)
            }}
          >
            <input type="hidden" name="chargeId" value={chargeId} />
            <DropdownMenuItem asChild>
              <button type="submit" className="w-full">
                <QrCode />
                Gerar PIX
              </button>
            </DropdownMenuItem>
          </form>

          <form action={reminderAction}>
            <input type="hidden" name="chargeId" value={chargeId} />
            <input type="hidden" name="channel" value="PUSH" />
            <DropdownMenuItem asChild>
              <button type="submit" className="w-full">
                <Send />
                Enviar lembrete
              </button>
            </DropdownMenuItem>
          </form>

          <form action={reminderAction}>
            <input type="hidden" name="chargeId" value={chargeId} />
            <input type="hidden" name="channel" value="EMAIL" />
            <DropdownMenuItem asChild>
              <button type="submit" className="w-full">
                <MessageSquare />
                Registrar contato
              </button>
            </DropdownMenuItem>
          </form>

          <DropdownMenuSeparator />

          <form action={settleAction}>
            <input type="hidden" name="chargeId" value={chargeId} />
            <input type="hidden" name="method" value="CASH" />
            <DropdownMenuItem asChild>
              <button type="submit" className="w-full">
                <Wallet />
                Registrar pagamento
              </button>
            </DropdownMenuItem>
          </form>
        </DropdownMenuContent>
      </DropdownMenu>

      {(settleState.message || reminderState.message) && (
        <span
          role="status"
          className="ml-2 text-xs text-synse-muted"
        >
          {settleState.message ?? reminderState.message}
        </span>
      )}

      <Dialog open={pixOpen} onOpenChange={setPixOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>PIX de {formatCurrency(amount)}</DialogTitle>
            <DialogDescription>
              Envie o código para {studentName}. A confirmação só é registrada quando o provedor
              notifica o pagamento.
            </DialogDescription>
          </DialogHeader>

          {pixPending && <p className="text-sm text-synse-muted">Gerando o código…</p>}

          {pixState.status === 'error' && (
            <p role="alert" className="text-sm text-synse-danger">
              {pixState.message}
            </p>
          )}

          {pixState.pix && (
            <div className="space-y-3">
              <p className="break-all rounded-lg bg-synse-surface-2 p-3 font-mono text-xs text-synse-text">
                {pixState.pix.payload}
              </p>
              <Button onClick={copyPix} className="w-full">
                <Copy className="size-4" />
                {copied ? 'Código copiado' : 'Copiar código PIX'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
