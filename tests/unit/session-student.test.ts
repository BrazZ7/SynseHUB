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

/** Simula o banco anterior à migration 0014, sem a coluna `tier`. */
let semColunaTier = false
/** Simula falha real de leitura — RLS negando, banco fora do ar. */
let erroDuro: { code: string; message: string } | null = null

function construirClient() {
  const encadeado = (tabela: string) => {
    let colunas = ''

    const erroDeColuna = () => {
      if (erroDuro && tabela === 'user_profiles') return erroDuro
      // Depois de `select('*')` a coluna ausente não é erro: ela simplesmente
      // não vem na linha. Pedi-la pelo nome é que derrubava a consulta.
      return semColunaTier && tabela === 'user_profiles' && colunas.includes('tier')
        ? { code: '42703', message: 'column user_profiles.tier does not exist' }
        : null
    }

    const linha = () => {
      const dado = tabelas[tabela] ?? null
      if (!semColunaTier || tabela !== 'user_profiles' || dado === null) return dado
      const { tier: _tier, professional_plan: _plano, ...resto } = dado as Record<string, unknown>
      return resto
    }

    const resultado = () => {
      const erro = erroDeColuna()
      return erro ? { data: null, error: erro } : { data: filtrado(), error: null }
    }

    /*
     * Os filtros são aplicados de verdade.
     *
     * O mock antes ignorava `eq`, e a mesma linha voltava para qualquer
     * consulta na tabela. Isso parou de servir quando a sessão passou a
     * perguntar "existe vínculo com papel SUPER_ADMIN?" na mesma
     * `organization_members`: sem filtrar, o vínculo comum respondia que sim,
     * e todo aluno destes testes virava conta de plataforma.
     */
    const filtros: { coluna: string; valor: unknown; negado: boolean }[] = []

    const passaNosFiltros = (dado: unknown) => {
      if (dado === null || typeof dado !== 'object') return true
      const registro = dado as Record<string, unknown>
      return filtros.every(({ coluna, valor, negado }) => {
        if (!(coluna in registro)) return true
        const igual = registro[coluna] === valor
        return negado ? !igual : igual
      })
    }

    const filtrado = () => {
      const dado = linha()
      if (Array.isArray(dado)) return dado.filter(passaNosFiltros)
      return passaNosFiltros(dado) ? dado : null
    }

    // A consulta de matrículas é aguardada direto (devolve lista); a de equipe
    // termina em `maybeSingle`. O `then` cobre a primeira forma.
    const alvo = {
      select: (cols = '') => {
        colunas = cols
        return alvo
      },
      eq: (coluna: string, valor: unknown) => {
        filtros.push({ coluna, valor, negado: false })
        return alvo
      },
      neq: (coluna: string, valor: unknown) => {
        filtros.push({ coluna, valor, negado: true })
        return alvo
      },
      order: () => alvo,
      limit: () => alvo,
      maybeSingle: async () => resultado(),
      then: (resolver: (valor: { data: unknown; error: unknown }) => unknown) =>
        Promise.resolve(resolver(resultado())),
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
/** O contexto que a conta de plataforma pediu. Editável pelos testes. */
let cookieContexto: string | undefined
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (nome: string) =>
      nome === 'synse_contexto' && cookieContexto ? { value: cookieContexto } : undefined,
  }),
}))

const { getSession, resolveSession } = await import('@/lib/auth/session')

const SOLO = '00000000-0000-0000-0000-000000000001'

const PERFIL = {
  id: 'perfil-1',
  synse_id: 'SYN-ABCD2345',
  name: 'Joana Ribeiro',
  email: 'joana@exemplo.com',
  avatar_url: null,
  tier: 'PRO',
  professional_plan: true,
}

beforeEach(() => {
  for (const chave of Object.keys(tabelas)) delete tabelas[chave]
  semColunaTier = false
  erroDuro = null
  cookieContexto = undefined
})

describe('getSession', () => {
  it('reconhece o aluno que só tem matrícula, sem vínculo de equipe', async () => {
    tabelas.user_profiles = PERFIL
    tabelas.organization_members = null
    tabelas.students = [
      {
        id: 'aluno-1',
        organization_id: 'org-1',
        status: 'ACTIVE',
        organizations: { name: 'Academia Alpha' },
      },
    ]

    const sessao = await getSession()

    expect(sessao).toMatchObject({
      role: 'STUDENT',
      organizationId: 'org-1',
      organizationName: 'Academia Alpha',
      studentId: 'aluno-1',
      isSoloStudent: false,
    })
  })

  it('quem entrou sem academia é aluno, na organização reservada', async () => {
    tabelas.user_profiles = PERFIL
    tabelas.organization_members = null
    tabelas.students = [
      {
        id: 'aluno-solo',
        organization_id: SOLO,
        status: 'ACTIVE',
        organizations: { name: 'Synse' },
      },
    ]

    expect(await getSession()).toMatchObject({
      role: 'STUDENT',
      studentId: 'aluno-solo',
      isSoloStudent: true,
      organizationName: 'Por conta própria',
    })
  })

  /*
   * Quem entrou sozinho e depois recebeu o código da academia tem as duas
   * matrículas, possivelmente criadas no mesmo dia. Ordenar por data decidiria
   * no empate — e poderia decidir diferente amanhã.
   */
  it('academia de verdade ganha da organização reservada', async () => {
    tabelas.user_profiles = PERFIL
    tabelas.organization_members = null
    tabelas.students = [
      {
        id: 'aluno-solo',
        organization_id: SOLO,
        status: 'ACTIVE',
        organizations: { name: 'Synse' },
      },
      {
        id: 'aluno-1',
        organization_id: 'org-1',
        status: 'PENDING',
        organizations: { name: 'Academia Alpha' },
      },
    ]

    expect(await getSession()).toMatchObject({
      studentId: 'aluno-1',
      organizationName: 'Academia Alpha',
      isSoloStudent: false,
    })
  })

  it('sem matrícula e sem vínculo, não há sessão', async () => {
    tabelas.user_profiles = PERFIL
    tabelas.organization_members = null
    tabelas.students = []

    expect(await getSession()).toBeNull()
  })

  it('quem é equipe continua sendo lido como equipe', async () => {
    tabelas.user_profiles = PERFIL
    tabelas.organization_members = {
      organization_id: 'org-1',
      role: 'OWNER',
      organizations: { name: 'Academia Alpha' },
    }
    tabelas.students = []

    const sessao = await getSession()

    expect(sessao).toMatchObject({ role: 'OWNER', organizationId: 'org-1' })
  })

  /*
   * O caso que derrubou o login em produção.
   *
   * `tier` só existe depois da migration 0014, e publicar não aplica migration.
   * Pedir a coluna derrubava a consulta inteira: a sessão virava nula, quem
   * acabava de entrar era mandado para o cadastro, e da tela parecia que o
   * botão de login não respondia.
   */
  it('funciona no banco anterior às migrations que criaram as colunas de plano', async () => {
    semColunaTier = true
    tabelas.user_profiles = PERFIL
    tabelas.organization_members = {
      organization_id: 'org-1',
      role: 'OWNER',
      organizations: { name: 'Academia Alpha' },
    }
    tabelas.students = []

    // Sem as colunas, a sessão existe e cai no plano gratuito — em vez de
    // sumir e mandar a pessoa para a escolha de perfil.
    expect(await getSession()).toMatchObject({
      role: 'OWNER',
      organizationId: 'org-1',
      tier: 'FREE',
      professionalPlan: false,
    })
  })

  it('lê o plano da conta quando as colunas existem', async () => {
    tabelas.user_profiles = PERFIL
    tabelas.organization_members = {
      organization_id: 'org-1',
      role: 'OWNER',
      organizations: { name: 'Academia Alpha' },
    }
    tabelas.students = []

    expect(await getSession()).toMatchObject({ tier: 'PRO', professionalPlan: true })
  })

  /*
   * A distinção que faltava.
   *
   * Falha de leitura e conta inexistente respondiam a mesma coisa — `null` — e
   * quem tem academia há meses era mandado para o cadastro, com "você é
   * academia, profissional ou aluno?". Pergunta que, respondida de novo, cria
   * uma segunda academia vazia no lugar da que a pessoa já tem.
   */
  it('falha de leitura não é conta inexistente', async () => {
    erroDuro = { code: '42501', message: 'permission denied for table user_profiles' }
    tabelas.user_profiles = PERFIL

    const resolucao = await resolveSession()

    expect(resolucao.status).toBe('unavailable')
    expect(resolucao).toMatchObject({ step: 'profile', code: '42501' })
  })

  it('conta autenticada sem academia nem matrícula é conta a cadastrar', async () => {
    tabelas.user_profiles = PERFIL
    tabelas.organization_members = null
    tabelas.students = []

    expect((await resolveSession()).status).toBe('no-account')
  })

  it('sem ficha não há sessão, mesmo autenticado', async () => {
    tabelas.user_profiles = null

    expect(await getSession()).toBeNull()
  })
})

/**
 * A conta de plataforma.
 *
 * O cookie diz o que a pessoa pediu; quem decide é o vínculo no banco. O teste
 * que mais importa aqui é o do cookie forjado — se ele passasse, qualquer
 * aluno entraria em qualquer academia digitando um id no navegador.
 */
describe('contexto da conta de plataforma', () => {
  const VINCULO_PLATAFORMA = {
    organization_id: '00000000-0000-0000-0000-000000000002',
    role: 'SUPER_ADMIN',
    status: 'ACTIVE',
    organizations: { name: 'Synse Plataforma' },
  }

  it('cookie forjado por quem não é conta de plataforma é ignorado', async () => {
    tabelas.user_profiles = PERFIL
    tabelas.organization_members = null
    tabelas.students = [
      { id: 'aluno-1', organization_id: 'org-1', status: 'ACTIVE', organizations: { name: 'Alpha' } },
    ]
    // O aluno escreve o id de outra academia no cookie e recarrega.
    cookieContexto = '11111111-2222-3333-4444-555555555555'

    const sessao = await getSession()

    expect(sessao).toMatchObject({
      role: 'STUDENT',
      organizationId: 'org-1',
      isPlatformAccount: false,
    })
  })

  it('conta comum nunca é marcada como plataforma', async () => {
    tabelas.user_profiles = PERFIL
    tabelas.organization_members = {
      organization_id: 'org-1',
      role: 'OWNER',
      status: 'ACTIVE',
      organizations: { name: 'Alpha' },
    }

    expect(await getSession()).toMatchObject({ role: 'OWNER', isPlatformAccount: false })
  })

  it('sem contexto escolhido, a organização da plataforma não vira a academia', async () => {
    /*
     * O vínculo de plataforma existe só para hospedar o papel. Tratá-lo como a
     * academia da pessoa abriria o painel numa organização sem alunos e sem
     * cobranças — e sem nada que explicasse por quê.
     */
    tabelas.user_profiles = PERFIL
    tabelas.organization_members = VINCULO_PLATAFORMA
    tabelas.students = [
      { id: 'aluno-1', organization_id: 'org-1', status: 'ACTIVE', organizations: { name: 'Alpha' } },
    ]

    const sessao = await getSession()

    expect(sessao).toMatchObject({
      organizationId: 'org-1',
      role: 'STUDENT',
      isPlatformAccount: true,
    })
  })
})
