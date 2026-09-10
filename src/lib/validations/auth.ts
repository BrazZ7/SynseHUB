import { z } from 'zod'

export const credentialsSchema = z.object({
  email: z.string().trim().email('Informe um e-mail válido.'),
  password: z.string().min(8, 'A senha precisa ter ao menos 8 caracteres.'),
})

export type Credentials = z.infer<typeof credentialsSchema>
