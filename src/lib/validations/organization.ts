import { z } from 'zod'

export const organizationProfileSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome da academia.').max(80),
  legalName: z.string().trim().max(120).optional().default(''),
  city: z.string().trim().max(80).optional().default(''),
  state: z.string().trim().length(2, 'Use a sigla do estado.').optional().or(z.literal('')),
  type: z.enum(['GYM', 'NETWORK', 'BRANCH', 'CLINIC', 'STUDIO', 'BOX', 'COMPANY']).default('GYM'),
})

export const inviteMemberSchema = z.object({
  name: z.string().trim().min(3, 'Informe o nome.').max(120),
  email: z.string().trim().toLowerCase().email('Informe um e-mail válido.'),
  role: z.enum(['OWNER', 'MANAGER', 'RECEPTIONIST', 'TRAINER', 'NUTRITIONIST', 'PROFESSIONAL']),
  registrationNumber: z.string().trim().max(40).optional().default(''),
})

export type InviteMemberInput = z.infer<typeof inviteMemberSchema>
