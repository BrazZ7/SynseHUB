import { z } from 'zod'

/**
 * ── O formulário do programa ────────────────────────────────────────────────
 *
 * `id` é identificador, não UUID — a mesma lição que `validations/workout.ts`
 * carrega e que o acervo repetiu: em demonstração os ids são legíveis
 * (`prog_21`), e um `uuid()` aqui quebraria a edição inteira com um "Invalid
 * uuid" que não diz nada a quem clicou em "Editar".
 */
export const saveProgramSchema = z.object({
  id: z.string().trim().max(64).optional().default(''),
  /** Chave estável, única na 0003. Maiúsculas por convenção dos existentes. */
  code: z
    .string()
    .trim()
    .min(2, 'Dê um código.')
    .max(40)
    .regex(/^[A-Z0-9_]+$/, 'Só letras maiúsculas, números e _.'),
  title: z.string().trim().min(3, 'Dê um título.').max(140),
  description: z.string().trim().max(600).optional().default(''),
  /*
   * A faixa é a mesma da 0043, e repeti-la aqui não é duplicação inútil: o
   * banco recusa com uma exceção, e a tela precisa dizer isso no campo antes
   * de a pessoa escrever 90 dias de conteúdo e perder tudo no envio.
   */
  durationDays: z.coerce.number().int().min(1, 'Mínimo de 1 dia.').max(365, 'Máximo de 365 dias.'),
  coverUrl: z
    .union([z.literal(''), z.string().url('Endereço de capa inválido.')])
    .optional()
    .default(''),
  visibility: z.enum(['FREE', 'SYNSE_PLUS']).default('SYNSE_PLUS'),
})

export type SaveProgramForm = z.infer<typeof saveProgramSchema>

/**
 * Um dia do programa.
 *
 * As tarefas chegam como texto, uma por linha — é o jeito de digitar que
 * sobrevive a copiar e colar de qualquer lugar. A conversão para lista mora
 * aqui, com o `trim` e o descarte de linha vazia, para a tela e a action não
 * terem duas versões da mesma regra.
 */
export const saveProgramStepSchema = z.object({
  programId: z.string().trim().min(1),
  dayNumber: z.coerce.number().int().min(1, 'O dia começa em 1.').max(365),
  title: z.string().trim().min(2, 'Dê um título ao dia.').max(140),
  tasks: z.string().max(4_000).optional().default(''),
})

export type SaveProgramStepForm = z.infer<typeof saveProgramStepSchema>

/** Texto com uma tarefa por linha → lista. Linha vazia não vira tarefa. */
export function tarefasDoTexto(texto: string): string[] {
  return texto
    .split('\n')
    .map((linha) => linha.trim())
    .filter(Boolean)
}
