import { describe, expect, it } from 'vitest'

import { isPendingMigration } from '@/lib/database/pending-migration'

/**
 * Distinguir "o banco ainda não tem isso" de "a consulta está errada" é o que
 * permite a tela sumir em vez de quebrar na janela entre publicar e migrar.
 * Confundir os dois nas duas direções é caro: esconder um defeito de verdade,
 * ou derrubar o app por uma coluna que chega em cinco minutos.
 */
describe('isPendingMigration', () => {
  it('reconhece coluna e tabela que ainda não existem', () => {
    expect(isPendingMigration({ code: '42703', message: 'column x does not exist' })).toBe(true)
    expect(isPendingMigration({ code: '42P01' })).toBe(true)
    expect(isPendingMigration({ code: 'PGRST205' })).toBe(true)
    expect(isPendingMigration({ code: 'PGRST202' })).toBe(true)
  })

  it('reconhece o erro embrulhado pelo data source, que guarda o original em cause', () => {
    const original = { code: 'PGRST205', message: 'Could not find the table in the schema cache' }
    const embrulhado = new Error('supabase query failed: listBaselineChallenges', {
      cause: original,
    })

    expect(isPendingMigration(embrulhado)).toBe(true)
  })

  it('não confunde defeito com migration pendente', () => {
    expect(isPendingMigration(null)).toBe(false)
    expect(isPendingMigration(new Error('supabase query failed: listPlans'))).toBe(false)
    expect(isPendingMigration({ code: '23505', message: 'duplicate key value' })).toBe(false)
    expect(isPendingMigration({ code: '42501', message: 'permission denied' })).toBe(false)
  })

  it('não entra em laço com causa circular', () => {
    const laco: { message: string; cause?: unknown } = { message: 'erro' }
    laco.cause = laco

    expect(isPendingMigration(laco)).toBe(false)
  })
})
