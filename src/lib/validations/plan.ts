import { z } from 'zod'

export const createPlanSchema = z.object({
  name: z.string().trim().min(2, 'Dê um nome ao plano.').max(60),
  description: z.string().trim().max(280).optional().default(''),
  price: z.coerce.number().min(0, 'O preço não pode ser negativo.').max(100000),
  billingCycle: z.enum(['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL', 'CUSTOM']),
  enrollmentFee: z.coerce.number().min(0).max(100000).default(0),
  weeklyAccessDays: z.coerce.number().int().min(1).max(7).optional(),
  benefits: z.array(z.string().trim().min(1)).max(12).default([]),
  autoCharge: z.coerce.boolean().default(true),
})

export type CreatePlanInput = z.infer<typeof createPlanSchema>
