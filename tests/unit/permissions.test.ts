import { describe, expect, it } from 'vitest'

import { can, canAny, isHubRole } from '@/lib/permissions/permissions'

/**
 * A especificação é explícita: permissão não pode ser controlada só pelo
 * front-end. Estes testes fixam quem pode o quê, para que afrouxar um papel
 * por engano quebre a suíte em vez de virar vazamento em produção.
 */

describe('permissões por papel', () => {
  it('proprietário e gerente enxergam o financeiro', () => {
    expect(can('OWNER', 'finance:read')).toBe(true)
    expect(can('MANAGER', 'finance:read')).toBe(true)
  })

  it('professor NÃO enxerga o financeiro', () => {
    // Foi exatamente este vazamento que o painel teve: receita e inadimplência
    // apareciam para o professor.
    expect(can('TRAINER', 'finance:read')).toBe(false)
  })

  it('recepção registra check-in, professor e aluno não gerenciam cobrança', () => {
    expect(can('RECEPTIONIST', 'checkin:write')).toBe(true)
    expect(can('TRAINER', 'finance:write')).toBe(false)
    expect(can('STUDENT', 'finance:write')).toBe(false)
  })

  it('aluno não tem nenhuma permissão administrativa', () => {
    const administrativas = [
      'finance:read',
      'finance:write',
      'students:write',
      'staff:write',
      'settings:write',
    ] as const
    for (const permissao of administrativas) {
      expect(can('STUDENT', permissao)).toBe(false)
    }
  })

  it('aluno não entra no painel administrativo', () => {
    expect(isHubRole('STUDENT')).toBe(false)
    expect(isHubRole('OWNER')).toBe(true)
    expect(isHubRole('TRAINER')).toBe(true)
  })

  it('canAny exige ao menos uma', () => {
    expect(canAny('TRAINER', ['finance:read', 'students:read'])).toBe(true)
    expect(canAny('STUDENT', ['finance:read', 'staff:write'])).toBe(false)
  })
})
