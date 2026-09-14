import { z } from 'zod'

const timeSchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Informe um horário válido.')

export const createClassScheduleSchema = z
  .object({
    name: z.string().trim().min(2, 'Dê um nome à aula.').max(80),
    description: z.string().trim().max(500).optional().default(''),
    staffId: z.string().uuid('Escolha um profissional válido.').optional(),
    weekday: z.coerce.number().int().min(0).max(6),
    startTime: timeSchema,
    durationMinutes: z.coerce
      .number()
      .int('Use minutos inteiros.')
      .min(5, 'A duração mínima é de 5 minutos.')
      .max(480, 'A duração máxima é de 8 horas.'),
    capacity: z.coerce
      .number()
      .int('Use um número inteiro de vagas.')
      .min(1, 'A aula precisa ter pelo menos uma vaga.')
      .max(500, 'A capacidade máxima é de 500 vagas.'),
    room: z.string().trim().max(80).optional().default(''),
    startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data inicial.'),
    endsOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data final.')
      .optional(),
    daysAhead: z.coerce.number().int().min(0).max(120).default(21),
  })
  .superRefine((value, ctx) => {
    if (value.endsOn && value.endsOn < value.startsOn) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endsOn'],
        message: 'A data final não pode ser antes da inicial.',
      })
    }
  })

export type CreateClassScheduleInput = z.infer<typeof createClassScheduleSchema>
