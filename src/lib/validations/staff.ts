import { z } from 'zod'

/**
 * Funções que se convidam pela tela.
 *
 * `STUDENT` não está aqui — aluno entra pelo código da academia, não por
 * convite de equipe, e as duas coisas dão acessos muito diferentes.
 * `SUPER_ADMIN` também não: é acesso à plataforma inteira, não a uma academia.
 */
export const CONVIDAVEIS = ['MANAGER', 'RECEPTIONIST', 'TRAINER', 'NUTRITIONIST'] as const

export const createStaffInviteSchema = z.object({
  email: z.string().trim().toLowerCase().email('Informe um e-mail válido.'),
  role: z.enum(CONVIDAVEIS, { message: 'Escolha a função.' }),
  jobTitle: z.string().trim().max(60).optional().default(''),
  registrationNumber: z.string().trim().max(40).optional().default(''),
})

export type CreateStaffInviteInput = z.infer<typeof createStaffInviteSchema>
