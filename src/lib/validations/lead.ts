import { z } from 'zod'

export const LEAD_STAGES = [
  'NEW',
  'CONTACTED',
  'TRIAL_CLASS',
  'PROPOSAL',
  'ENROLLED',
  'LOST',
] as const

export const STAGE_LABELS: Record<(typeof LEAD_STAGES)[number], string> = {
  NEW: 'Novo',
  CONTACTED: 'Contatado',
  TRIAL_CLASS: 'Aula experimental',
  PROPOSAL: 'Proposta',
  ENROLLED: 'Matriculado',
  LOST: 'Perdido',
}

export const SOURCE_LABELS = {
  INSTAGRAM: 'Instagram',
  GOOGLE: 'Google',
  REFERRAL: 'Indicação',
  WEBSITE: 'Site',
  WHATSAPP: 'WhatsApp',
  OTHER: 'Outro',
} as const

export const saveLeadSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome.').max(120),
  /*
   * Telefone e e-mail são opcionais separadamente, mas um dos dois precisa
   * existir: lead sem forma de contato é uma linha que ninguém consegue
   * trabalhar.
   */
  phone: z.string().trim().max(20).optional().default(''),
  email: z.union([z.literal(''), z.string().email('E-mail inválido.')]).optional().default(''),
  source: z.enum(['INSTAGRAM', 'GOOGLE', 'REFERRAL', 'WEBSITE', 'WHATSAPP', 'OTHER']),
  ownerStaffId: z.string().trim().optional().default(''),
  notes: z.string().trim().max(600).optional().default(''),
  nextFollowUpAt: z.union([z.literal(''), z.string().date()]).optional().default(''),
}).refine((v) => v.phone !== '' || v.email !== '', {
  message: 'Informe ao menos telefone ou e-mail — sem contato não dá para trabalhar o lead.',
  path: ['phone'],
})

export const moveStageSchema = z.object({
  leadId: z.string().min(1),
  stage: z.enum(LEAD_STAGES),
  lostReason: z.string().trim().max(200).optional().default(''),
})

export const leadNoteSchema = z.object({
  leadId: z.string().min(1),
  kind: z.enum(['NOTE', 'CALL', 'MESSAGE', 'VISIT']),
  body: z.string().trim().min(1, 'Escreva o que aconteceu.').max(600),
})

export const convertLeadSchema = z.object({
  leadId: z.string().min(1),
  planId: z.string().trim().optional().default(''),
  billingDay: z.coerce.number().int().min(1).max(28).default(5),
})
