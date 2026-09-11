import { z } from 'zod'

import { isValidCpf, normalizeTaxId } from '@/lib/validations/tax-id'

/**
 * CPF é opcional no cadastro e obrigatório para cobrar.
 *
 * Exigir na entrada travaria o caso mais comum de uso — cadastrar o aluno que
 * acabou de chegar, antes de acertar a mensalidade. Mas quando informado tem
 * que ser válido: guardar um CPF errado é pior que não guardar nenhum, porque
 * a falha só aparece na emissão da cobrança.
 */
const taxIdSchema = z
  .string()
  .trim()
  .transform(normalizeTaxId)
  .refine((value) => value.length === 0 || isValidCpf(value), {
    message: 'CPF inválido. Confira os números.',
  })

/** Aceita 10 ou 11 dígitos, com ou sem máscara. */
const phoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/\D/g, ''))
  .refine((value) => value.length === 0 || value.length === 10 || value.length === 11, {
    message: 'Informe um telefone com DDD.',
  })

export const createStudentSchema = z.object({
  name: z.string().trim().min(3, 'Informe o nome completo.').max(120, 'Nome muito longo.'),
  email: z.string().trim().toLowerCase().email('Informe um e-mail válido.'),
  phone: phoneSchema.optional().default(''),
  taxId: taxIdSchema.optional().default(''),
  goal: z.string().trim().max(80).optional().default(''),
  planId: z.string().trim().min(1, 'Escolha um plano.').or(z.literal('')),
  trainerId: z.string().trim().optional().default(''),
  billingDay: z.coerce
    .number()
    .int()
    .min(1, 'O dia de vencimento vai de 1 a 28.')
    .max(28, 'O dia de vencimento vai de 1 a 28.')
    .default(5),
})

export type CreateStudentInput = z.infer<typeof createStudentSchema>

/** Linha de importação CSV. Nada inválido entra no banco. */
export const studentImportRowSchema = z.object({
  nome: z.string().trim().min(3),
  email: z.string().trim().toLowerCase().email(),
  telefone: phoneSchema.optional().default(''),
  cpf: taxIdSchema.optional().default(''),
  plano: z.string().trim().optional().default(''),
  vencimento: z.coerce.number().int().min(1).max(28).optional().default(5),
  status: z.enum(['ativo', 'inativo']).optional().default('ativo'),
})

export type StudentImportRow = z.infer<typeof studentImportRowSchema>
