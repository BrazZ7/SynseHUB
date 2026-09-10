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

/**
 * Cadastro de uma nova academia.
 *
 * O CNPJ é opcional: academia pequena costuma começar como pessoa física, e
 * exigir o documento aqui barraria justamente quem o SynseHub quer atender
 * primeiro. Quando informado, validamos só o formato — 14 dígitos.
 */
export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome da academia.').max(80),
  ownerName: z.string().trim().min(3, 'Informe seu nome completo.').max(120),
  legalName: z.string().trim().max(120).optional().default(''),
  taxId: z
    .string()
    .trim()
    .transform((value) => value.replace(/\D/g, ''))
    .refine((value) => value === '' || value.length === 14, 'O CNPJ precisa ter 14 dígitos.')
    .optional()
    .default(''),
  city: z.string().trim().max(80).optional().default(''),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .refine((value) => value === '' || value.length === 2, 'Use a sigla do estado, com 2 letras.')
    .optional()
    .default(''),
})

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>
