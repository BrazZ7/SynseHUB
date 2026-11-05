import { z } from 'zod'

/** Medida em branco é medida não tomada, e vira nulo — nunca zero. */
const medida = (max: number, rotulo: string) =>
  z
    .union([z.literal(''), z.coerce.number().min(0, `${rotulo} não pode ser negativo.`).max(max)])
    .optional()
    .transform((v) => (v === '' || v === undefined ? null : Number(v)))

export const saveAssessmentSchema = z
  .object({
    assessedAt: z.string().date('Informe a data da avaliação.'),
    protocol: z.enum(['MANUAL', 'POLLOCK_3', 'POLLOCK_7']),
    protocolSex: z.union([z.literal(''), z.enum(['MALE', 'FEMALE'])]).transform((v) => v || null),
    ageYears: medida(120, 'A idade'),

    weight: medida(400, 'O peso'),
    /** Centímetros, como se anota na ficha — nunca metros. */
    height: medida(260, 'A altura'),
    bodyFatPercentage: medida(80, 'O percentual de gordura'),

    chest: medida(250, 'O tórax'),
    arm: medida(120, 'O braço'),
    waist: medida(250, 'A cintura'),
    abdomen: medida(250, 'O abdômen'),
    hip: medida(250, 'O quadril'),
    thigh: medida(150, 'A coxa'),
    calf: medida(100, 'A panturrilha'),

    skinfoldChest: medida(100, 'A dobra peitoral'),
    skinfoldAxilla: medida(100, 'A dobra axilar'),
    skinfoldTriceps: medida(100, 'A dobra do tríceps'),
    skinfoldSubscapular: medida(100, 'A dobra subescapular'),
    skinfoldAbdominal: medida(100, 'A dobra abdominal'),
    skinfoldSuprailiac: medida(100, 'A dobra supra-ilíaca'),
    skinfoldThigh: medida(100, 'A dobra da coxa'),

    notes: z.string().trim().max(600).optional().default(''),
  })
  /*
   * Protocolo de dobras sem sexo declarado não tem equação: as de Jackson &
   * Pollock são específicas, e não existe versão validada fora disso. Recusar
   * aqui é melhor que gravar uma avaliação que nunca vai mostrar percentual.
   */
  .refine((v) => v.protocol === 'MANUAL' || v.protocolSex !== null, {
    message: 'Escolha a equação — masculina ou feminina — para calcular pelas dobras.',
    path: ['protocolSex'],
  })
  .refine((v) => v.protocol === 'MANUAL' || v.ageYears !== null, {
    message: 'A idade entra na equação: sem ela não há percentual de gordura.',
    path: ['ageYears'],
  })

export type SaveAssessmentFormInput = z.infer<typeof saveAssessmentSchema>
