import { z } from 'zod'

export const credentialsSchema = z.object({
  email: z.string().trim().email('Informe um e-mail válido.'),
  password: z.string().min(8, 'A senha precisa ter ao menos 8 caracteres.'),
})

export type Credentials = z.infer<typeof credentialsSchema>

/** Entrada por link enviado no e-mail: não há senha para validar. */
export const emailLinkSchema = z.object({
  email: z.string().trim().email('Informe um e-mail válido.'),
})

export type EmailLink = z.infer<typeof emailLinkSchema>

/** Criação de conta. A senha mínima acompanha a do login. */
export const signUpSchema = z.object({
  name: z.string().trim().min(3, 'Informe seu nome completo.').max(120),
  email: z.string().trim().toLowerCase().email('Informe um e-mail válido.'),
  password: z.string().min(8, 'A senha precisa ter ao menos 8 caracteres.'),
})

export type SignUp = z.infer<typeof signUpSchema>

/** Pedido de recuperação: só o e-mail, como o link de acesso. */
export const recuperarSenhaSchema = z.object({
  email: z.string().trim().email('Informe um e-mail válido.'),
})

/**
 * A senha nova.
 *
 * ── Por que a confirmação existe ─────────────────────────────────────────────
 *
 * Porque o erro de digitação aqui é o mais caro de todos: a pessoa sai com uma
 * senha que não sabe qual é, e o único caminho de volta é fazer tudo de novo.
 * Um campo escondido atrás de asteriscos não perdoa.
 *
 * ── E por que oito caracteres, e não uma regra de maiúscula e símbolo ───────
 *
 * Porque é o mesmo mínimo do cadastro e do login, e mudar aqui criaria contas
 * que entram e não conseguem trocar a própria senha. Regra de composição,
 * além disso, empurra para `Senha@123` — comprimento protege mais.
 */
export const novaSenhaSchema = z
  .object({
    password: z.string().min(8, 'A senha precisa ter ao menos 8 caracteres.'),
    confirmacao: z.string(),
    /** Só exigida de quem já está logado e não veio pelo link do e-mail. */
    senhaAtual: z.string().optional().default(''),
  })
  .refine((dados) => dados.password === dados.confirmacao, {
    message: 'As duas senhas precisam ser iguais.',
    path: ['confirmacao'],
  })

export type NovaSenha = z.infer<typeof novaSenhaSchema>
