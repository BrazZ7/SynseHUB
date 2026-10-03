import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * ── A busca de aluno, no servidor ───────────────────────────────────────────
 *
 * Cinco telas escolhiam aluno num `<select>` montado a partir de
 * `listStudents`, e **essa lista para em 100** — `Math.min(100, …)` nos dois
 * data sources. Numa academia com 478 ativos, quatro em cada cinco alunos não
 * existiam para marcar avaliação, atribuir treino, reservar aula ou
 * prescrever dieta. Sem aviso: o nome simplesmente não estava lá.
 *
 * O pior caso era o balcão: a recepção digitava o nome de quem estava na
 * frente dela e lia "Nenhum aluno encontrado" — porque o filtro corria sobre
 * a lista já cortada, não sobre o cadastro.
 *
 * O que estes testes protegem:
 *
 * 1. **A academia sai da sessão**, nunca do argumento.
 * 2. **A permissão é conferida** antes de qualquer leitura.
 * 3. **A projeção é estreita**: nome, Synse ID e plano. Um seletor não é
 *    lugar de telefone, e-mail, CPF nem situação financeira.
 * 4. **O `total` é o do cadastro**, não o da página — é o que deixa a tela
 *    dizer "mostrando 12 de 83" em vez de calar sobre o corte, que foi
 *    exatamente o defeito do `<select>`.
 */

const dataSource = { listStudents: vi.fn() }
const permissao = { negar: false }

vi.mock('@/lib/auth/require-session', () => ({
  requireHubSession: async () => ({
    organizationId: 'org-da-sessao',
    userProfileId: 'perfil-1',
    role: 'MANAGER',
  }),
}))

vi.mock('@/lib/permissions/guard', () => ({
  requirePermission: () => {
    if (permissao.negar) {
      const erro = new Error('sem permissão') as Error & { userMessage: string }
      erro.name = 'AppError'
      throw erro
    }
  },
}))

vi.mock('@/lib/database', () => ({ getDataSource: async () => dataSource }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: async () => ({ allowed: true }) }))

const { buscarAlunosAction } = await import('@/features/students/busca-de-aluno')

const ALUNO = {
  id: 'stu_1',
  name: 'Sofia Gomes',
  synseId: 'SYN-1',
  planName: 'Mensal',
  email: 'sofia@exemplo.com',
  phone: '11999999999',
  taxId: '12345678900',
  nextChargeAmount: 149.9,
  status: 'ACTIVE',
}

beforeEach(() => {
  permissao.negar = false
  dataSource.listStudents.mockReset()
  dataSource.listStudents.mockResolvedValue({ rows: [ALUNO], total: 478, page: 1, pageSize: 12 })
})

describe('buscarAlunosAction', () => {
  it('procura na academia da sessão, com o termo digitado', async () => {
    await buscarAlunosAction('sofia')

    expect(dataSource.listStudents).toHaveBeenCalledWith(
      'org-da-sessao',
      expect.objectContaining({ search: 'sofia', status: 'ACTIVE' }),
    )
  })

  it('devolve o total do cadastro, não o da página', async () => {
    const r = await buscarAlunosAction('ana')

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.total).toBe(478)
    expect(r.alunos).toHaveLength(1)
  })

  it('não leva telefone, e-mail, CPF nem cobrança', async () => {
    /*
     * A asserção que mais importa. O seletor aparece em tela de recepção, e
     * cada campo a mais aqui é dado pessoal viajando para um lugar que não
     * precisa dele — e que um dia alguém renderiza sem pensar.
     */
    const r = await buscarAlunosAction('sofia')
    expect(r.ok).toBe(true)
    if (!r.ok) return

    const texto = JSON.stringify(r.alunos)
    for (const proibido of ['sofia@exemplo.com', '11999999999', '12345678900', '149.9']) {
      expect(texto, `vazou ${proibido}`).not.toContain(proibido)
    }
    expect(Object.keys(r.alunos[0]).sort()).toEqual(['id', 'name', 'planName', 'synseId'])
  })

  it('sem `students:read` não lê nada', async () => {
    permissao.negar = true

    const r = await buscarAlunosAction('sofia')

    expect(r.ok).toBe(false)
    expect(dataSource.listStudents).not.toHaveBeenCalled()
  })

  it('termo vazio devolve o começo da lista, em vez de buscar por nada', async () => {
    // Abrir o seletor sem digitar mostra os primeiros: é o "navegar" que o
    // `<select>` dava de graça e que não se pode perder.
    await buscarAlunosAction('')

    expect(dataSource.listStudents).toHaveBeenCalledWith(
      'org-da-sessao',
      expect.objectContaining({ search: undefined }),
    )
  })

  it('o balcão enxerga quem não está ativo, quando pedido', async () => {
    // Suspenso e inadimplente aparecem no check-in de propósito: é ali que a
    // recepção precisa ver a situação, não descobrir que o aluno "sumiu".
    await buscarAlunosAction('sofia', false)

    expect(dataSource.listStudents).toHaveBeenCalledWith(
      'org-da-sessao',
      expect.objectContaining({ status: 'ALL' }),
    )
  })

  it('termo gigante é cortado antes de virar consulta', async () => {
    await buscarAlunosAction('a'.repeat(5000))

    const [, filtros] = dataSource.listStudents.mock.calls[0]
    expect(filtros.search.length).toBeLessThanOrEqual(80)
  })
})
