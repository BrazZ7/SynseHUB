import { z } from 'zod'

export const manualCheckInSchema = z.object({
  studentId: z.string().trim().min(1, 'Selecione um aluno.'),
})

export const qrCheckInSchema = z.object({
  /** Token efêmero exibido no totem da academia. */
  token: z.string().trim().min(10, 'QR Code inválido.'),
})

export type ManualCheckInInput = z.infer<typeof manualCheckInSchema>
