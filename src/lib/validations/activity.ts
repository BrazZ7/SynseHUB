import { z } from 'zod'

/**
 * O que o aparelho pode mandar.
 *
 * Coordenada tem faixa: latitude entre -90 e 90, longitude entre -180 e 180.
 * Parece pedantismo até alguém mandar 1e308 e a consulta do mapa devolver
 * `Infinity` para todo mundo.
 *
 * O limite de pontos protege o banco: 20 mil pontos são mais de cinco horas a
 * um ponto por segundo. Acima disso é engano ou abuso, e nos dois casos a
 * resposta é a mesma.
 */
const coordinate = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
})

export const routePointSchema = coordinate.extend({
  altitude: z.number().min(-500).max(9000).nullable(),
  speed: z.number().min(0).max(200).nullable(),
  accuracy: z.number().min(0).max(10_000).nullable(),
  heading: z.number().min(0).max(360).nullable(),
  recordedAt: z.string().datetime(),
  distanceFromPrevious: z.number().min(0),
  totalDistance: z.number().min(0),
})

export const activitySplitSchema = z.object({
  kilometer: z.number().int().positive().max(1000),
  splitSeconds: z.number().positive(),
  paceSeconds: z.number().positive(),
  elevationGain: z.number(),
})

export const saveActivitySchema = z.object({
  clientId: z.string().min(8).max(64),
  sport: z.enum(['RUN', 'WALK', 'RIDE']),
  title: z.string().trim().max(120).nullable().optional(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  // Uma semana de atividade é absurdo, e é o teto que impede um número
  // corrompido virar estatística.
  elapsedSeconds: z.number().min(0).max(604_800),
  movingSeconds: z.number().min(0).max(604_800),
  distanceMeters: z.number().min(0).max(1_000_000),
  averagePace: z.number().positive().nullable(),
  bestPace: z.number().positive().nullable(),
  averageSpeed: z.number().min(0),
  maxSpeed: z.number().min(0),
  elevationGain: z.number().min(0),
  elevationLoss: z.number().min(0),
  minAltitude: z.number().nullable(),
  maxAltitude: z.number().nullable(),
  calories: z.number().int().min(0).max(50_000),
  privacy: z.enum(['PUBLIC', 'GYM', 'PRIVATE']),
  route: z.array(routePointSchema).max(20_000),
  splits: z.array(activitySplitSchema).max(1000),
})

export type SaveActivityPayload = z.infer<typeof saveActivitySchema>
