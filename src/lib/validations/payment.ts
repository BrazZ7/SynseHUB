import { z } from 'zod'

export const manualPaymentSchema = z.object({
  chargeId: z.string().trim().min(1),
  method: z.enum(['PIX', 'CREDIT_CARD', 'BOLETO', 'CASH']),
  note: z.string().trim().max(240).optional().default(''),
})

export const createPixSchema = z.object({
  chargeId: z.string().trim().min(1),
})

export const collectionActionSchema = z.object({
  chargeId: z.string().trim().min(1),
  channel: z.enum(['PUSH', 'EMAIL', 'WHATSAPP']),
  note: z.string().trim().max(240).optional().default(''),
})

export type ManualPaymentInput = z.infer<typeof manualPaymentSchema>
