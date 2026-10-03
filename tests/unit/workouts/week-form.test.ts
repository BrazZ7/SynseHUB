import { describe, expect, it } from 'vitest'

import { parseWeekForm } from '@/features/workouts/form'
import { createWeekSchema } from '@/lib/validations/workout'

const UM = '11111111-1111-4111-8111-111111111111'
const DOIS = '22222222-2222-4222-8222-222222222222'
const TRES = '33333333-3333-4333-8333-333333333333'

describe('parseWeekForm', () => {
  it('separa os exercícios pelo dia a que pertencem', () => {
    const semana = parseWeekForm({
      goal: 'Hipertrofia',
      dayLabel: ['A', 'B'],
      dayName: ['Pernas', 'Costas'],
      rowDay: ['0', '0', '1'],
      exerciseId: [UM, DOIS, TRES],
      sets: ['4', '3', '5'],
      reps: ['10', '12', '8'],
      restSeconds: ['90', '60', '120'],
    })

    expect(semana.days).toHaveLength(2)
    expect(semana.days[0].name).toBe('Pernas')
    expect(semana.days[0].exercises.map((e) => e.exerciseId)).toEqual([UM, DOIS])
    expect(semana.days[1].exercises.map((e) => e.exerciseId)).toEqual([TRES])
  })

  it('mantém cada linha com os próprios números', () => {
    /*
     * O defeito clássico deste formato: os vetores desalinham e as séries de
     * um exercício vão parar em outro. Aqui vale a mais: iriam para outro DIA.
     */
    const semana = parseWeekForm({
      dayLabel: ['A', 'B'],
      dayName: ['Um', 'Dois'],
      rowDay: ['0', '1'],
      exerciseId: [UM, DOIS],
      sets: ['4', '3'],
      reps: ['10', '12'],
      restSeconds: ['90', '45'],
    })

    expect(semana.days[0].exercises[0]).toMatchObject({ sets: '4', reps: '10', restSeconds: '90' })
    expect(semana.days[1].exercises[0]).toMatchObject({ sets: '3', reps: '12', restSeconds: '45' })
  })

  it('ignora a linha em branco sem embaralhar o resto', () => {
    const semana = parseWeekForm({
      dayLabel: ['A'],
      dayName: ['Pernas'],
      rowDay: ['0', '0', '0'],
      exerciseId: [UM, '', DOIS],
      sets: ['4', '3', '5'],
      reps: ['10', '12', '8'],
    })

    expect(semana.days[0].exercises).toHaveLength(2)
    // A terceira linha tem de manter as próprias séries, e não as da vazia.
    expect(semana.days[0].exercises[1]).toMatchObject({ exerciseId: DOIS, sets: '5', reps: '8' })
  })

  it('descarta o dia que ficou sem exercício', () => {
    const semana = parseWeekForm({
      dayLabel: ['A', 'B', 'C'],
      dayName: ['Um', 'Vazio', 'Tres'],
      rowDay: ['0', '2'],
      exerciseId: [UM, DOIS],
      sets: ['3', '3'],
      reps: ['10', '10'],
    })

    expect(semana.days.map((d) => d.name)).toEqual(['Um', 'Tres'])
  })

  it('batiza o dia com a letra da posição quando a divisão vem vazia', () => {
    const semana = parseWeekForm({
      dayLabel: ['', ''],
      dayName: ['Um', 'Dois'],
      rowDay: ['0', '1'],
      exerciseId: [UM, DOIS],
      sets: ['3', '3'],
      reps: ['10', '10'],
    })

    expect(semana.days.map((d) => d.splitLabel)).toEqual(['A', 'B'])
  })

  it('não inventa dia quando não veio nenhum', () => {
    expect(parseWeekForm({}).days).toEqual([])
  })
})

describe('createWeekSchema', () => {
  const diaValido = {
    splitLabel: 'A',
    name: 'Pernas',
    exercises: [{ exerciseId: UM, sets: 3, reps: '10', restSeconds: 60 }],
  }

  it('aceita uma semana montada', () => {
    const r = createWeekSchema.safeParse({ goal: '', days: [diaValido] })
    expect(r.success).toBe(true)
  })

  it('recusa semana sem dia nenhum', () => {
    const r = createWeekSchema.safeParse({ goal: '', days: [] })
    expect(r.success).toBe(false)
  })

  it('recusa mais de sete dias', () => {
    const r = createWeekSchema.safeParse({ goal: '', days: Array(8).fill(diaValido) })
    expect(r.success).toBe(false)
  })

  it('recusa dia sem exercício', () => {
    const r = createWeekSchema.safeParse({
      goal: '',
      days: [{ ...diaValido, exercises: [] }],
    })
    expect(r.success).toBe(false)
  })
})
