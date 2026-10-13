import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RESUMO_VAZIO, type ResumoDaAcademia } from '@/features/organizations/resumo'

/**
 * ── Os totais são de todas as academias, não da página ──────────────────────
 *
 * Esta é a propriedade que a paginação do painel não pode quebrar, e ela é
 * fácil de quebrar sem ninguém notar: somar `organizations` em vez de somar os
 * resumos passa em qualquer tela com uma página só — que é exatamente o que a
 * demonstração tem, e o que a Synse tem hoje.
 *
 * O sintoma seria um GMV de plataforma que **muda ao clicar em "próxima"**.
 * Nenhum erro, nenhuma tela quebrada: só um número de diretoria que depende de
 * onde o cursor parou.
 *
 * Por isso o teste monta um data source de mentira com mais academias do que
 * cabem numa página. Sem isso, a asserção passaria por omissão.
 */

const ACADEMIAS = 7
const POR_PAGINA = 5

const organizacoes = Array.from({ length: ACADEMIAS }, (_, i) => ({
  id: `org_${i + 1}`,
  name: `Academia ${i + 1}`,
  slug: `a${i + 1}`,
  status: 'ACTIVE' as const,
  hubPlan: 'PRO' as const,
  createdAt: '2026-01-01T00:00:00Z',
  city: null,
}))

/** Cada academia recebeu 100: o total da plataforma tem de ser 700. */
const resumos: ResumoDaAcademia[] = organizacoes.map((o) => ({
  ...RESUMO_VAZIO(o.id),
  alunosAtivos: 10,
  recebido: 100,
  atrasadoQtd: 1,
}))

const dataSource = {
  listOrganizations: vi.fn(),
  resumoDasAcademias: vi.fn(),
  academiasPorPlano: vi.fn(),
  listBillingSettings: vi.fn(),
}

vi.mock('@/lib/database', () => ({ getDataSource: async () => dataSource }))

const { getPlatformMetrics } = await import('@/features/organizations/platform-service')

beforeEach(() => {
  dataSource.listOrganizations.mockImplementation(
    async ({ page = 1, pageSize = POR_PAGINA }: { page?: number; pageSize?: number } = {}) => ({
      rows: organizacoes.slice((page - 1) * pageSize, page * pageSize),
      total: ACADEMIAS,
      page,
      pageSize,
    }),
  )
  dataSource.resumoDasAcademias.mockResolvedValue(resumos)
  dataSource.academiasPorPlano.mockResolvedValue({ PRO: ACADEMIAS })
  dataSource.listBillingSettings.mockResolvedValue(new Map())
})

describe('getPlatformMetrics', () => {
  it('a lista é a página, os totais são todos', async () => {
    const primeira = await getPlatformMetrics({ page: 1, pageSize: POR_PAGINA })

    expect(primeira.organizations).toHaveLength(POR_PAGINA)
    expect(primeira.totals.gmv).toBe(700)
    expect(primeira.totals.students).toBe(70)
    expect(primeira.totals.overdueCount).toBe(ACADEMIAS)
    expect(primeira.totals.organizations).toBe(ACADEMIAS)
  })

  it('virar a página não mexe em nenhum total', async () => {
    /*
     * A asserção que pega o defeito de verdade: qualquer total calculado
     * sobre `organizations` em vez de sobre os resumos muda aqui, porque a
     * segunda página tem duas academias e a primeira tem cinco.
     */
    const primeira = await getPlatformMetrics({ page: 1, pageSize: POR_PAGINA })
    const segunda = await getPlatformMetrics({ page: 2, pageSize: POR_PAGINA })

    expect(segunda.organizations).toHaveLength(ACADEMIAS - POR_PAGINA)
    expect(segunda.totals).toEqual(primeira.totals)
  })

  it('o resumo é pedido para todas, e a lista para uma página', async () => {
    await getPlatformMetrics({ page: 2, pageSize: POR_PAGINA })

    // `null` é "todas que eu posso ver" — o teto é o segundo argumento.
    expect(dataSource.resumoDasAcademias).toHaveBeenCalledWith(null, expect.any(Number))
    expect(dataSource.listOrganizations).toHaveBeenCalledWith({ page: 2, pageSize: POR_PAGINA })
  })

  it('os acordos de cobrança saem de uma consulta só', async () => {
    // Era uma por academia, dentro do laço. Com cinquenta clientes, cinquenta
    // idas ao banco para ler cinquenta linhas.
    await getPlatformMetrics({ pageSize: POR_PAGINA })

    expect(dataSource.listBillingSettings).toHaveBeenCalledTimes(1)
    expect(dataSource.listBillingSettings).toHaveBeenCalledWith(organizacoes.map((o) => o.id))
  })

  it('diz quando o teto do resumo cortou, em vez de calar', async () => {
    dataSource.resumoDasAcademias.mockResolvedValue(resumos.slice(0, 3))

    const metrics = await getPlatformMetrics({ pageSize: POR_PAGINA })

    expect(metrics.totaisCompletos).toBe(false)
    expect(metrics.totaisSobre).toBe(3)
  })

  it('com tudo somado, não diz nada — o aviso não é decoração', async () => {
    const metrics = await getPlatformMetrics({ pageSize: POR_PAGINA })
    expect(metrics.totaisCompletos).toBe(true)
  })

  it('o MRR conta por plano, não por linha da página', async () => {
    dataSource.academiasPorPlano.mockResolvedValue({ PRO: 7 })
    const metrics = await getPlatformMetrics({ page: 2, pageSize: POR_PAGINA })

    // 7 × R$ 299 (SynseHub Pro), independentemente de a página ter duas.
    expect(metrics.totals.mrr).toBe(7 * 299)
    expect(metrics.totals.activeOrganizations).toBe(7)
  })
})
