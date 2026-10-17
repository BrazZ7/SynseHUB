import { z } from 'zod'

/** 0 = domingo, igual ao `getDay()` e ao `extract(dow)`. */
export const DIAS_DA_SEMANA = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
] as const

export const saveClassScheduleSchema = z
  .object({
    name: z.string().trim().min(2, 'Dê um nome à aula.').max(80),
    description: z.string().trim().max(300).optional().default(''),
    staffId: z.string().trim().optional().default(''),
    weekday: z.coerce.number().int().min(0).max(6),
    startTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário inválido. Use HH:MM.'),
    durationMinutes: z.coerce
      .number()
      .int()
      .min(5, 'A aula precisa durar ao menos 5 minutos.')
      .max(480, 'Oito horas é o limite de uma aula.'),
    capacity: z.coerce
      .number()
      .int()
      .min(1, 'A turma precisa de ao menos uma vaga.')
      .max(500, 'Quinhentas vagas é o limite.'),
    room: z.string().trim().max(60).optional().default(''),
    startsOn: z.string().date('Informe a data de início.'),
    endsOn: z.union([z.literal(''), z.string().date()]).optional().default(''),
    status: z.enum(['ACTIVE', 'ARCHIVED']).default('ACTIVE'),
  })
  /*
   * Regra que termina antes de começar não gera aula nenhuma, e o banco recusa
   * com erro de constraint. Recusar aqui devolve a frase em vez do código.
   */
  .refine((v) => !v.endsOn || v.endsOn >= v.startsOn, {
    message: 'O fim da grade não pode ser antes do início.',
    path: ['endsOn'],
  })

export type SaveClassScheduleFormInput = z.infer<typeof saveClassScheduleSchema>

export const cancelSessionSchema = z.object({
  sessionId: z.string().min(1),
  reason: z.string().trim().max(200).optional().default(''),
})

export const attendanceSchema = z.object({
  bookingId: z.string().min(1),
  sessionId: z.string().min(1),
  status: z.enum(['ATTENDED', 'NO_SHOW', 'BOOKED']),
})

export const bookingSchema = z.object({
  sessionId: z.string().min(1),
  /** Preenchido só quando a recepção marca por telefone. */
  studentId: z.string().trim().optional().default(''),
})

export const cancelBookingSchema = z.object({
  bookingId: z.string().min(1),
})
