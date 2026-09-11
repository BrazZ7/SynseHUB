import { z } from 'zod'

import { isValidTaxId, normalizeTaxId } from '@/lib/validations/tax-id'

/**
 * Documento da academia: CNPJ, ou CPF de quem atua como autônomo.
 *
 * Aceitar os dois não é permissividade — é o que o provedor aceita na abertura
 * de subconta, e recusar CPF deixaria de fora o personal e o estúdio que ainda
 * não abriu empresa, que é boa parte de quem começa.
 *
 * Opcional no cadastro e obrigatório para cobrar. Quando informado, os dígitos
 * verificadores são conferidos: documento inválido guardado é recusado depois
 * pelo provedor, com a academia já cadastrada e ninguém ligando uma coisa à
 * outra.
 */
const taxIdSchema = z
  .string()
  .trim()
  .transform(normalizeTaxId)
  .refine((value) => value === '' || isValidTaxId(value), {
    message: 'Documento inválido. Informe um CNPJ ou CPF válido.',
  })

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
 * O documento é opcional aqui: academia pequena costuma começar como pessoa
 * física, e exigi-lo barraria justamente quem o SynseHub quer atender primeiro.
 */
export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome da academia.').max(80),
  ownerName: z.string().trim().min(3, 'Informe seu nome completo.').max(120),
  legalName: z.string().trim().max(120).optional().default(''),
  taxId: taxIdSchema.optional().default(''),
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

/**
 * Dados fiscais da academia.
 *
 * Separado do perfil porque tem uma consequência que o resto não tem: é este
 * documento que abre a subconta no provedor de pagamento. Sem ele a academia
 * não cobra.
 */
export const fiscalDataSchema = z.object({
  legalName: z.string().trim().max(120).optional().default(''),
  taxId: taxIdSchema.optional().default(''),
})

export type FiscalDataInput = z.infer<typeof fiscalDataSchema>
