import { describe, expect, it } from 'vitest'

import { parseWorkoutForm } from '@/features/workouts/form'
import { createWorkoutSchema } from '@/lib/validations/workout'

const UM = '11111111-1111-1111-1111-111111111111'
const DOIS = '22222222-2222-2222-2222-222222222222'

describe('linhas do formulário de treino', () => {
  it('recompõe cada linha juntando os vetores pelo índice', () => {
    const { exercises } = parseWorkoutForm({
      name: 'Superiores',
      exerciseId: [UM, DOIS],
      sets: ['4', '3'],
      reps: ['8-10', 'até a falha'],
      restSeconds: ['90', '45'],
    })

    expect(exercises).toEqual([
      {
        exerciseId: UM,
        sets: '4',
        reps: '8-10',
        restSeconds: '90',
        suggestedLoad: undefined,
        notes: '',
      },
      {
        exerciseId: DOIS,
        sets: '3',
        reps: 'até a falha',
        restSeconds: '45',
        suggestedLoad: undefined,
        notes: '',
      },
    ])
  })

  it('linha aberta e não usada é ignorada, sem levar junto a de baixo', () => {
    // O erro clássico é filtrar depois de casar os vetores por posição, ou
    // filtrar antes e desalinhar as colunas: as séries de um exercício
    // acabariam em outro.
    const { exercises } = parseWorkoutForm({
      name: 'A',
      exerciseId: [UM, '', DOIS],
      sets: ['4', '3', '5'],
      reps: ['8', '12', '6'],
    })

    expect(exercises).toHaveLength(2)
    expect(exercises[0]).toMatchObject({ exerciseId: UM, sets: '4', reps: '8' })
    expect(exercises[1]).toMatchObject({ exerciseId: DOIS, sets: '5', reps: '6' })
  })

  it('vetor mais curto não quebra: o que falta cai no padrão', () => {
    const { exercises } = parseWorkoutForm({ name: 'A', exerciseId: [UM], reps: [] })
    expect(exercises[0]).toMatchObject({ sets: '3', restSeconds: '60', reps: '' })
  })

  it('divisão em branco vira A', () => {
    expect(parseWorkoutForm({ name: 'A', splitLabel: '' }).splitLabel).toBe('A')
    expect(parseWorkoutForm({ name: 'A', splitLabel: 'B' }).splitLabel).toBe('B')
  })
})

describe('validação do treino', () => {
  const base = { name: 'Superiores', goal: '', splitLabel: 'A' }

  it('treino sem exercício nenhum é recusado', () => {
    const parsed = createWorkoutSchema.safeParse({ ...base, exercises: [] })
    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      // Um plano vazio pode ser atribuído e o aluno abre para encontrar nada.
      expect(parsed.error.issues[0]?.message).toContain('abre em branco')
    }
  })

  it('repetição continua sendo texto, porque a prescrição real é texto', () => {
    for (const reps of ['12', '8-10', 'até a falha', '30 s por lado']) {
      const parsed = createWorkoutSchema.safeParse({
        ...base,
        exercises: [{ exerciseId: UM, sets: '3', reps, restSeconds: '60', notes: '' }],
      })
      expect(parsed.success).toBe(true)
    }
  })

  /*
   * Este teste afirmava que `'supino'` era recusado — o schema exigia UUID.
   *
   * A exigência caiu, e por um motivo concreto: no modo de demonstração os
   * identificadores são legíveis (`exr_0018`), e o formulário recusava a
   * montagem inteira com "Escolha um exercício da biblioteca" logo depois de a
   * pessoa escolher um. A criação de treino nunca funcionou ali.
   *
   * O nome antigo também prometia demais. Um UUID bem formado e inexistente
   * passava por essa validação do mesmo jeito: quem garante que o exercício é
   * da biblioteca é a chave estrangeira, e quem garante que é desta academia é
   * a RLS. O que sobra para o schema é o que ele pode mesmo saber — que veio
   * alguma coisa, e que ela tem tamanho de identificador.
   */
  it('aceita o identificador da biblioteca, no formato que o banco usar', () => {
    for (const exerciseId of [UM, 'exr_0018']) {
      const parsed = createWorkoutSchema.safeParse({
        ...base,
        exercises: [{ exerciseId, sets: '3', reps: '12', restSeconds: '60', notes: '' }],
      })
      expect(parsed.success).toBe(true)
    }
  })

  it('recusa exercício em branco e identificador absurdo', () => {
    const embranco = createWorkoutSchema.safeParse({
      ...base,
      exercises: [{ exerciseId: '   ', sets: '3', reps: '12', restSeconds: '60', notes: '' }],
    })
    expect(embranco.success).toBe(false)

    const enorme = createWorkoutSchema.safeParse({
      ...base,
      exercises: [
        { exerciseId: 'x'.repeat(200), sets: '3', reps: '12', restSeconds: '60', notes: '' },
      ],
    })
    expect(enorme.success).toBe(false)
  })

  it('zero séries é recusado; o descanso pode ser zero', () => {
    const semSerie = createWorkoutSchema.safeParse({
      ...base,
      exercises: [{ exerciseId: UM, sets: '0', reps: '12', restSeconds: '60', notes: '' }],
    })
    expect(semSerie.success).toBe(false)

    const semDescanso = createWorkoutSchema.safeParse({
      ...base,
      exercises: [{ exerciseId: UM, sets: '3', reps: '12', restSeconds: '0', notes: '' }],
    })
    expect(semDescanso.success).toBe(true)
  })

  it('o caminho inteiro, do formulário ao schema', () => {
    const parsed = createWorkoutSchema.safeParse(
      parseWorkoutForm({
        name: 'Inferiores',
        goal: 'Força',
        splitLabel: 'B',
        exerciseId: [UM, '', DOIS],
        sets: ['4', '3', '3'],
        reps: ['6', '12', '10'],
        restSeconds: ['120', '60', '90'],
        suggestedLoad: ['80', '', ''],
        notes: ['Subir devagar', '', ''],
      }),
    )

    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.exercises).toHaveLength(2)
      expect(parsed.data.exercises[0]).toMatchObject({
        sets: 4,
        reps: '6',
        restSeconds: 120,
        suggestedLoad: 80,
        notes: 'Subir devagar',
      })
      expect(parsed.data.exercises[1]).toMatchObject({ sets: 3, reps: '10', restSeconds: 90 })
    }
  })
})
