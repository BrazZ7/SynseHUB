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

/**
 * Edição de aluno já matriculado.
 *
 * É o cadastro sem o e-mail. Ele é a identidade da conta, que pertence à
 * pessoa e vale em todas as academias — trocá-lo pelo painel de uma delas
 * renomearia o login de alguém a partir de fora.
 */
export const updateStudentSchema = createStudentSchema.omit({ email: true })

export type UpdateStudentInput = z.infer<typeof updateStudentSchema>

/**
 * Situações que a tela pode aplicar à mão.
 *
 * `OVERDUE` fica de fora: inadimplência é consequência de cobrança vencida, e
 * marcar na mão criaria uma verdade que o financeiro não conhece. `PENDING`
 * também: é o estado de quem entrou por código e ainda não foi confirmado, e
 * voltar alguém para lá desfaria uma confirmação sem desfazer nada mais.
 */
export const studentStatusChangeSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE', 'CANCELLED']),
})

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
