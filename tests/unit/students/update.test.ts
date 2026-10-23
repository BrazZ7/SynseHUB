import { describe, expect, it } from 'vitest'

import { studentStatusChangeSchema, updateStudentSchema } from '@/lib/validations/student'

describe('edição de aluno', () => {
  const base = { name: 'Ana Ribeiro', phone: '', taxId: '', goal: '', planId: '', trainerId: '' }

  it('o e-mail não faz parte da edição', () => {
    // Ele é a identidade da conta, que vale em qualquer academia: aceitar o
    // campo aqui deixaria o painel de uma renomear o login de alguém.
    expect(Object.keys(updateStudentSchema.shape)).not.toContain('email')

    const parsed = updateStudentSchema.safeParse({ ...base, email: 'outra@pessoa.com' })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect('email' in parsed.data).toBe(false)
  })

  it('CPF inválido é recusado também na edição', () => {
    expect(updateStudentSchema.safeParse({ ...base, taxId: '111.111.111-11' }).success).toBe(false)
  })

  it('dia de vencimento fora de 1 a 28 é recusado', () => {
    expect(updateStudentSchema.safeParse({ ...base, billingDay: 31 }).success).toBe(false)
    expect(updateStudentSchema.safeParse({ ...base, billingDay: 28 }).success).toBe(true)
  })
})

describe('mudança de situação', () => {
  it('aceita ativar, suspender e encerrar', () => {
    for (const status of ['ACTIVE', 'INACTIVE', 'CANCELLED']) {
      expect(studentStatusChangeSchema.safeParse({ status }).success).toBe(true)
    }
  })

  it('recusa inadimplente e pendente', () => {
    /*
     * OVERDUE é consequência de cobrança vencida: marcar na mão criaria uma
     * verdade que o financeiro não conhece. PENDING é o estado de quem entrou
     * por código e ainda não foi confirmado — voltar alguém para lá desfaria a
     * confirmação sem desfazer mais nada.
     */
    expect(studentStatusChangeSchema.safeParse({ status: 'OVERDUE' }).success).toBe(false)
    expect(studentStatusChangeSchema.safeParse({ status: 'PENDING' }).success).toBe(false)
  })
})
