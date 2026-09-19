import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { applyMigrations, asUser, connect, databaseAvailable, seedTwoGyms, ALPHA, BETA } from './helpers'

/**
 * Avaliação física.
 *
 * O que estes testes protegem é um número de saúde. Percentual de gordura
 * errado é plausível — ninguém desconfia de 18,4% —, e a pessoa toma decisão
 * sobre o próprio corpo com base nele. Por isso a conta não vem do cliente, e
 * por isso os coeficientes têm teste com valor conhecido.
 */

let client: Client
const temBanco = await databaseAvailable()
let alunoAlpha: string

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)
  await seedTwoGyms(client, 2)

  const { rows } = await client.query(
    `select id from students where organization_id = $1 order by id limit 1`,
    [ALPHA.orgId],
  )
  alunoAlpha = rows[0].id
}, 60_000)

afterAll(async () => {
  await client?.end()
})

async function avaliar(campos: Record<string, unknown>) {
  const colunas = ['organization_id', 'student_id', ...Object.keys(campos)]
  const valores = [ALPHA.orgId, alunoAlpha, ...Object.values(campos)]
  const marcas = valores.map((_, i) => `$${i + 1}`).join(',')
  const { rows } = await client.query(
    `insert into assessments (${colunas.join(',')}) values (${marcas})
     returning bmi::float8 as bmi, body_density::float8 as densidade,
               body_fat_percentage::float8 as gordura`,
    valores,
  )
  return rows[0] as { bmi: number | null; densidade: number | null; gordura: number | null }
}

describe.skipIf(!temBanco)('índice de massa corporal', () => {
  it('sai do peso e da altura, em centímetros', async () => {
    // 80 kg e 1,80 m → 24,69.
    const r = await avaliar({ weight: 80, height: 180 })
    expect(r.bmi).toBeCloseTo(24.69, 2)
  })

  it('sem altura não há IMC, em vez de um número inventado', async () => {
    expect((await avaliar({ weight: 80 })).bmi).toBeNull()
  })

  it('o valor digitado é ignorado: quem manda são peso e altura', async () => {
    /*
     * O defeito que isto impede é um IMC que discorda do peso e da altura na
     * mesma linha — o tipo de erro que parece verdade porque está escrito.
     */
    const r = await avaliar({ weight: 80, height: 180, bmi: 99 })
    expect(r.bmi).toBeCloseTo(24.69, 2)
  })
})

describe.skipIf(!temBanco)('Pollock de 3 dobras', () => {
  it('homem: peitoral, abdômen e coxa', async () => {
    /*
     * Jackson & Pollock (1978) mais a equação de Siri. Soma 45 mm, 30 anos:
     *   D = 1,10938 − 0,0008267·45 + 0,0000016·45² − 0,0002574·30 = 1,06770
     *   %G = 495/D − 450 = 13,61
     *
     * Os valores foram recalculados fora do banco antes de virarem expectativa.
     * A primeira versão deste teste trazia números que eu tinha feito de
     * cabeça, e estavam errados — o teste falhou contra um SQL correto.
     */
    const r = await avaliar({
      protocol: 'POLLOCK_3',
      protocol_sex: 'MALE',
      age_years: 30,
      sf_chest: 10,
      sf_abdominal: 20,
      sf_thigh: 15,
    })
    expect(r.densidade).toBeCloseTo(1.0677, 4)
    expect(r.gordura).toBeCloseTo(13.61, 2)
  })

  it('mulher: tríceps, supra-ilíaca e coxa', async () => {
    /*
     * Jackson, Pollock & Ward (1980). Soma 60 mm, 30 anos:
     *   D = 1,0994921 − 0,0009929·60 + 0,0000023·60² − 0,0001392·30 = 1,04402
     *   %G = 24,13
     */
    const r = await avaliar({
      protocol: 'POLLOCK_3',
      protocol_sex: 'FEMALE',
      age_years: 30,
      sf_triceps: 20,
      sf_suprailiac: 20,
      sf_thigh: 20,
    })
    expect(r.densidade).toBeCloseTo(1.04402, 4)
    expect(r.gordura).toBeCloseTo(24.13, 2)
  })

  it('a equação de cada sexo usa dobras diferentes', async () => {
    // As mesmas três dobras num e noutro dariam resultados sem sentido: o
    // conjunto de pontos faz parte da equação, não é escolha do avaliador.
    const homem = await avaliar({
      protocol: 'POLLOCK_3', protocol_sex: 'MALE', age_years: 30,
      sf_chest: 10, sf_abdominal: 20, sf_thigh: 15, sf_triceps: 99, sf_suprailiac: 99,
    })
    expect(homem.densidade).toBeCloseTo(1.0677, 4)
  })

  it('idade pesa: o mesmo corpo, mais velho, estima mais gordura', async () => {
    const jovem = await avaliar({
      protocol: 'POLLOCK_3', protocol_sex: 'MALE', age_years: 20,
      sf_chest: 10, sf_abdominal: 20, sf_thigh: 15,
    })
    const veterano = await avaliar({
      protocol: 'POLLOCK_3', protocol_sex: 'MALE', age_years: 55,
      sf_chest: 10, sf_abdominal: 20, sf_thigh: 15,
    })
    expect(veterano.gordura!).toBeGreaterThan(jovem.gordura!)
  })
})

describe.skipIf(!temBanco)('Pollock de 7 dobras', () => {
  it('homem: soma das sete', async () => {
    /*
     * Soma 100 mm, 30 anos:
     *   D = 1,112 − 0,00043499·100 + 0,00000055·100² − 0,00028826·30 = 1,06535
     *   %G = 14,64
     *
     * O coeficiente de idade é 0,00028826. Uma das fontes que consultei trazia
     * 0,00012882 — dígitos embaralhados da equação feminina —, e a diferença
     * daria quase 2 pontos percentuais a menos num homem de 40 anos.
     */
    const r = await avaliar({
      protocol: 'POLLOCK_7', protocol_sex: 'MALE', age_years: 30,
      sf_chest: 12, sf_axilla: 12, sf_triceps: 12, sf_subscapular: 16,
      sf_abdominal: 20, sf_suprailiac: 16, sf_thigh: 12,
    })
    expect(r.densidade).toBeCloseTo(1.06535, 4)
    expect(r.gordura).toBeCloseTo(14.64, 2)
  })

  it('mulher: soma das sete', async () => {
    /*
     * Soma 120 mm, 30 anos:
     *   D = 1,097 − 0,00046971·120 + 0,00000056·120² − 0,00012828·30 = 1,04485
     *   %G = 23,75
     */
    const r = await avaliar({
      protocol: 'POLLOCK_7', protocol_sex: 'FEMALE', age_years: 30,
      sf_chest: 12, sf_axilla: 14, sf_triceps: 20, sf_subscapular: 14,
      sf_abdominal: 20, sf_suprailiac: 20, sf_thigh: 20,
    })
    expect(r.densidade).toBeCloseTo(1.04485, 4)
    expect(r.gordura).toBeCloseTo(23.75, 2)
  })
})

describe.skipIf(!temBanco)('o que a conta recusa fazer', () => {
  it('percentual digitado vale quando o protocolo é manual', async () => {
    // Bioimpedância e adipômetro de farmácia entregam o número pronto.
    const r = await avaliar({ protocol: 'MANUAL', body_fat_percentage: 22.5, weight: 70, height: 170 })
    expect(r.gordura).toBeCloseTo(22.5, 2)
    expect(r.densidade).toBeNull()
  })

  it('percentual digitado é sobrescrito quando há protocolo', async () => {
    const r = await avaliar({
      protocol: 'POLLOCK_3', protocol_sex: 'MALE', age_years: 30,
      sf_chest: 10, sf_abdominal: 20, sf_thigh: 15,
      body_fat_percentage: 5,
    })
    expect(r.gordura).toBeCloseTo(13.61, 2)
  })

  it('protocolo sem sexo declarado não inventa equação', async () => {
    /*
     * Não existe versão validada fora de masculino e feminino. Devolver nulo é
     * a resposta honesta; escolher uma das duas por padrão produziria um número
     * com aparência de medida.
     */
    const r = await avaliar({
      protocol: 'POLLOCK_3', age_years: 30, sf_chest: 10, sf_abdominal: 20, sf_thigh: 15,
    })
    expect(r.densidade).toBeNull()
    expect(r.gordura).toBeNull()
  })

  it('dobras sem idade não produzem número', async () => {
    const r = await avaliar({
      protocol: 'POLLOCK_7', protocol_sex: 'MALE',
      sf_chest: 12, sf_abdominal: 20, sf_thigh: 12,
    })
    expect(r.densidade).toBeNull()
  })

  it('dobras absurdas não viram gordura negativa', async () => {
    // Densidade altíssima devolveria percentual negativo, que não é uma pessoa
    // magra — é uma dobra medida errado.
    const r = await avaliar({
      protocol: 'POLLOCK_3', protocol_sex: 'MALE', age_years: 18,
      sf_chest: 1, sf_abdominal: 1, sf_thigh: 1,
    })
    expect(r.gordura!).toBeGreaterThanOrEqual(0)
  })

  it('editar a avaliação recalcula tudo de novo', async () => {
    const { rows } = await client.query(
      `insert into assessments (organization_id, student_id, weight, height)
       values ($1,$2,80,180) returning id`,
      [ALPHA.orgId, alunoAlpha],
    )
    await client.query(`update assessments set weight = 90 where id = $1`, [rows[0].id])

    const depois = await client.query(
      `select bmi::float8 as bmi from assessments where id = $1`,
      [rows[0].id],
    )
    expect(depois.rows[0].bmi).toBeCloseTo(27.78, 2)
  })
})

describe.skipIf(!temBanco)('quem enxerga dado de saúde', () => {
  it('academia nenhuma lê a avaliação de outra', async () => {
    await avaliar({ weight: 80, height: 180 })

    const daBeta = await asUser<{ total: number }>(
      client,
      BETA.authId,
      `select count(*)::int as total from assessments`,
    )
    expect(daBeta[0].total).toBe(0)
  })

  it('a academia dona lê as próprias', async () => {
    const daAlpha = await asUser<{ total: number }>(
      client,
      ALPHA.authId,
      `select count(*)::int as total from assessments`,
    )
    expect(daAlpha[0].total).toBeGreaterThan(0)
  })
})
