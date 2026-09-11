import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Ser equipe e ser aluno são vínculos diferentes: a equipe vive em
 * `organization_members`, o aluno em `students`. Perguntar "essa pessoa
 * pertence à organização?" olhando só para a equipe trata todo aluno como quem
 * não tem conta — ele entra, é devolvido para o onboarding, e da tela parece
 * que o botão não funcionou.
 *
 * O mesmo engano já tinha aparecido na RLS, impedindo o aluno de ler o nome da
 * própria academia. Estes testes existem para ele não voltar por uma terceira
 * porta.
 */

const tabelas: Record<string, unknown> = {}

function construirClient() {
  const encadeado = (tabela: string) => {
    const alvo = {
      select: () => alvo,
      eq: () => alvo,
      order: () => alvo,
      limit: () => alvo,
      maybeSingle: async () => ({ data: tabelas[tabela] ?? null }),
    }
    return alvo
  }

  return {
    auth: { getUser: async () => ({ data: { user: { id: 'auth-1' } } }) },
    from: (tabela: string) => encadeado(tabela),
  }
}

vi.mock('@/lib/database/env', () => ({ isDemoMode: () => false }))
vi.mock('@/lib/database/supabase-server', () => ({
  createSupabaseServerClient: async () => construirClient(),
}))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))

const { getSession } = await import('@/lib/auth/session')

const PERFIL = {
  id: 'perfil-1',
  synse_id: 'SYN-ABCD2345',
  name: 'Joana Ribeiro',
  email: 'joana@exemplo.com',
  avatar_url: null,
}

beforeEach(() => {
  for (const chave of Object.keys(tabelas)) delete tabelas[chave]
})

describe('getSession', () => {
  it('reconhece o aluno que só tem matrícula, sem vínculo de equipe', async () => {
    tabelas.user_profiles = PERFIL
    tabelas.organization_members = null
    tabelas.students = {
      id: 'aluno-1',
      organization_id: 'org-1',
      organizations: { name: 'Academia Alpha' },
    }

    const sessao = await getSession()

    expect(sessao).toMatchObject({
      role: 'STUDENT',
      organizationId: 'org-1',
      organizationName: 'Academia Alpha',
      studentId: 'aluno-1',
    })
  })

  it('sem matrícula e sem vínculo, não há sessão', async () => {
    tabelas.user_profiles = PERFIL
    tabelas.organization_members = null
    tabelas.students = null

    expect(await getSession()).toBeNull()
  })

  it('quem é equipe continua sendo lido como equipe', async () => {
    tabelas.user_profiles = PERFIL
    tabelas.organization_members = {
      organization_id: 'org-1',
      role: 'OWNER',
      organizations: { name: 'Academia Alpha' },
    }
    tabelas.students = null

    const sessao = await getSession()

    expect(sessao).toMatchObject({ role: 'OWNER', organizationId: 'org-1' })
  })

  it('sem ficha não há sessão, mesmo autenticado', async () => {
    tabelas.user_profiles = null

    expect(await getSession()).toBeNull()
  })
})
