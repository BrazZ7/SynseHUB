/** Estado das server actions do Synse Pay. */
export type PaymentActionState = {
  status: 'idle' | 'success' | 'error'
  message?: string
  pix?: { payload: string; expiresAt: string }
}

export const initialPaymentState: PaymentActionState = { status: 'idle' }
