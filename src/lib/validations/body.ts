import { z } from 'zod'

/**
 * O que o aparelho pode mandar numa pesagem.
 *
 * Toda faixa aqui tem uma razão prática. `weightKg` até 400 porque acima disso
 * não é pessoa numa balança doméstica; percentuais fechados entre 0 e 100
 * porque o banco tem o mesmo `check` e recusar aqui dá mensagem em português
 * em vez de erro de constraint; e `rawPayload` limitado porque ele existe para
 * auditoria de um pacote BLE, que cabe em bytes, não em megabytes.
 */

const origem = z.enum(['MEASURED', 'ESTIMATED', 'CALCULATED', 'ABSENT'])

export const fieldOriginSchema = z
  .object({
    weightKg: origem.optional(),
    bmi: origem.optional(),
    bodyFatPercent: origem.optional(),
    muscleMassKg: origem.optional(),
    leanMassKg: origem.optional(),
    bodyWaterPercent: origem.optional(),
    visceralFat: origem.optional(),
    boneMassKg: origem.optional(),
    bmrKcal: origem.optional(),
    impedanceOhm: origem.optional(),
  })
  .strict()

const percentual = z.number().min(0).max(100).nullable().optional()
const massa = z.number().min(0).max(400).nullable().optional()

export const recordBodyMeasurementSchema = z.object({
  clientId: z.string().trim().min(8).max(64),
  measuredAt: z.string().datetime(),
  source: z.enum(['BLUETOOTH_SCALE', 'MANUAL', 'APPLE_HEALTH', 'HEALTH_CONNECT', 'VENDOR_CLOUD']),
  deviceId: z.string().uuid().nullable().optional(),

  weightKg: z.number().gt(0).max(400),
  bmi: z.number().min(0).max(200).nullable().optional(),
  bodyFatPercent: percentual,
  muscleMassKg: massa,
  leanMassKg: massa,
  bodyWaterPercent: percentual,
  visceralFat: z.number().min(0).max(100).nullable().optional(),
  boneMassKg: z.number().min(0).max(50).nullable().optional(),
  bmrKcal: z.number().int().min(0).max(20_000).nullable().optional(),
  impedanceOhm: z.number().min(0).max(100_000).nullable().optional(),

  fieldOrigin: fieldOriginSchema.default({}),
  /*
   * Um pacote do padrão SIG tem menos de 30 bytes; em hexadecimal com espaços,
   * menos de 100 caracteres. O teto é folgado para caber uma medição partida
   * em vários pacotes, e apertado o suficiente para o campo não virar depósito.
   */
  rawPayload: z
    .object({
      hex: z.string().max(2_000).optional(),
      scaleUserId: z.number().int().min(0).max(255).nullable().optional(),
      /*
       * ── A trilha da importação de saúde ────────────────────────────────
       *
       * O Zod **descarta** campo não declarado em silêncio. Sem estas linhas,
       * a auditoria da importação sumiria sem erro nenhum: a pesagem entraria
       * no banco, o `raw_payload` chegaria com `{}` e, no dia em que um número
       * viesse estranho, não haveria como saber de qual app ele veio.
       *
       * O teto de `amostras` é 12 porque uma pesagem tem no máximo sete tipos
       * (ver `TipoDeAmostra`) e dois apps podem ter escrito o mesmo tipo.
       * Folgado o bastante para o caso real, apertado para o campo não virar
       * depósito.
       */
      fonte: z.enum(['apple_health', 'health_connect']).optional(),
      appDeOrigem: z.string().max(120).nullable().optional(),
      aparelhoDeOrigem: z.string().max(120).nullable().optional(),
      amostras: z
        .array(
          z.object({
            id: z.string().max(120),
            tipo: z.string().max(40),
            valor: z.number(),
          }),
        )
        .max(12)
        .optional(),
    })
    .nullable()
    .optional(),
})

/**
 * Uma importação inteira, num pedido só.
 *
 * Em lote e não uma a uma: uma primeira conexão traz centenas de pesagens, e
 * centenas de idas ao servidor levariam minutos com a pessoa olhando para uma
 * barra parada — além de abrir centenas de transações para gravar linhas que
 * cabem numa.
 *
 * O teto de 500 por chamada é o que impede um pedido gigante; a importação
 * fatia e manda em partes, e a idempotência do `clientId` faz um reenvio de
 * fatia ser inofensivo.
 */
export const LOTE_MAXIMO_DE_IMPORTACAO = 500

export const importHealthMeasurementsSchema = z.object({
  source: z.enum(['APPLE_HEALTH', 'HEALTH_CONNECT']),
  measurements: z.array(recordBodyMeasurementSchema).min(1).max(LOTE_MAXIMO_DE_IMPORTACAO),
})

export const manualBodyMeasurementSchema = z.object({
  clientId: z.string().trim().min(8).max(64),
  weightKg: z.number().gt(0).max(400),
  bodyFatPercent: percentual,
  measuredAt: z.string().datetime().optional(),
})

export const pairDeviceSchema = z.object({
  platformDeviceId: z.string().trim().min(1).max(200),
  displayName: z.string().trim().min(1).max(80),
  provider: z.string().trim().min(1).max(40).default('standard_ble'),
  manufacturer: z.string().trim().max(80).nullable().optional(),
  model: z.string().trim().max(80).nullable().optional(),
  protocol: z.string().trim().max(80).nullable().optional(),
  capabilities: z.record(z.string().max(40), z.boolean()).default({}),
  firmwareVersion: z.string().trim().max(40).nullable().optional(),
})

export const bodyPeriodSchema = z.enum(['7d', '30d', '3m', '6m', '1a', 'tudo'])
