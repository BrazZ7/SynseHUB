import { describe, expect, it } from 'vitest'

import { parseBeneficios, parsePlanForm } from '@/features/plans/form'
import { createPlanSchema } from '@/lib/validations/plan'

describe('benefícios do plano', () => {
  it('uma linha vira um item, e linha vazia não vira nada', () => {
    expect(parseBeneficios('Musculação\n\nAulas coletivas\n   \nAvaliação')).toEqual([
      'Musculação',
      'Aulas coletivas',
      'Avaliação',
    ])
  })

  it('campo vazio devolve lista vazia, não uma lista com uma string vazia', () => {
    expect(parseBeneficios('')).toEqual([])
    expect(parseBeneficios(undefined)).toEqual([])
    expect(parseBeneficios('\n\n\n')).toEqual([])
  })

  it('para em doze, que é o limite do schema', () => {
    const muitos = Array.from({ length: 30 }, (_, i) => `Item ${i}`).join('\n')
    expect(parseBeneficios(muitos)).toHaveLength(12)
  })
})

describe('formulário de plano', () => {
  const base = {
    name: 'Mensal livre',
    price: '109.90',
    billingCycle: 'MONTHLY',
    enrollmentFee: '0',
  }

  it('acesso livre não manda dias por semana', () => {
    const valores = parsePlanForm({ ...base, unlimitedAccess: 'on', weeklyAccessDays: '3' })
    // Zero diria "nenhum dia por semana" e criaria um plano que ninguém usa.
    expect(valores.weeklyAccessDays).toBeUndefined()

    const parsed = createPlanSchema.safeParse(valores)
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.weeklyAccessDays).toBeUndefined()
  })

  it('sem acesso livre, os dias declarados valem', () => {
    const valores = parsePlanForm({ ...base, weeklyAccessDays: '3' })
    const parsed = createPlanSchema.safeParse(valores)
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.weeklyAccessDays).toBe(3)
  })

  it('caixa desmarcada não é enviada pelo navegador, e isso significa não', () => {
    // O navegador omite a chave em vez de mandar "off"; ler a ausência como
    // falso é a única leitura correta.
    expect(parsePlanForm(base).autoCharge).toBe(false)
    expect(parsePlanForm({ ...base, autoCharge: 'on' }).autoCharge).toBe(true)
  })

  it('taxa de matrícula em branco vira zero, não erro', () => {
    const parsed = createPlanSchema.safeParse(parsePlanForm({ ...base, enrollmentFee: '' }))
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.enrollmentFee).toBe(0)
  })

  it('nome curto e preço negativo são recusados', () => {
    const semNome = createPlanSchema.safeParse(parsePlanForm({ ...base, name: 'A' }))
    expect(semNome.success).toBe(false)

    const negativo = createPlanSchema.safeParse(parsePlanForm({ ...base, price: '-10' }))
    expect(negativo.success).toBe(false)
  })

  it('dias fora de 1 a 7 são recusados', () => {
    for (const dias of ['0', '8']) {
      const parsed = createPlanSchema.safeParse(parsePlanForm({ ...base, weeklyAccessDays: dias }))
      expect(parsed.success).toBe(false)
    }
  })
})
