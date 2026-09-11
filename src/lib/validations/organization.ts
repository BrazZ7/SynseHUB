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
  /*
   * Natureza jurídica no vocabulário do provedor. A lista é dele, não nossa —
   * por isso não virou enum do domínio Synse.
   */
  companyType: z.enum(['', 'MEI', 'LIMITED', 'INDIVIDUAL', 'ASSOCIATION']).optional().default(''),
  postalCode: z
    .string()
    .trim()
    .transform((value) => value.replace(/\D/g, ''))
    .refine((value) => value === '' || value.length === 8, { message: 'O CEP tem 8 dígitos.' })
    .optional()
    .default(''),
  address: z.string().trim().max(120).optional().default(''),
  addressNumber: z.string().trim().max(20).optional().default(''),
  district: z.string().trim().max(80).optional().default(''),
  city: z.string().trim().max(80).optional().default(''),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .refine((value) => value === '' || value.length === 2, {
      message: 'Use a sigla, com 2 letras.',
    })
    .optional()
    .default(''),
  phone: z
    .string()
    .trim()
    .transform((value) => value.replace(/\D/g, ''))
    .refine((value) => value === '' || value.length === 10 || value.length === 11, {
      message: 'Informe o telefone com DDD.',
    })
    .optional()
    .default(''),
  /** Faturamento mensal estimado. O provedor exige na abertura da conta. */
  monthlyRevenue: z
    .string()
    .trim()
    .transform((value) =>
      value
        .replace(/[^\d,.-]/g, '')
        .replace(/\./g, '')
        .replace(',', '.'),
    )
    .refine((value) => value === '' || Number(value) >= 0, { message: 'Informe um valor válido.' })
    .optional()
    .default(''),
})

export type FiscalDataInput = z.infer<typeof fiscalDataSchema>

/**
 * Entrada do aluno pelo código de convite.
 *
 * Maiúsculas e sem espaço porque é assim que o código existe no banco, e quem
 * digita no celular manda minúscula com espaço sobrando o tempo todo. Corrigir
 * aqui evita recusar um código que estava certo.
 */
export const joinGymSchema = z.object({
  inviteCode: z
    .string()
    .trim()
    .toUpperCase()
    .refine((value) => /^[2-9A-HJKMNPQRSTVWXYZ]{6}$/.test(value), {
      message: 'O código tem 6 caracteres. Confira com a recepção.',
    }),
  studentName: z.string().trim().min(3, 'Informe seu nome completo.').max(120),
})

export type JoinGymInput = z.infer<typeof joinGymSchema>

/** Entrada sem academia: só o nome, e o nome já veio do cadastro da conta. */
export const soloStartSchema = z.object({
  studentName: z.string().trim().min(3, 'Informe seu nome completo.').max(120),
})

export type SoloStartInput = z.infer<typeof soloStartSchema>
