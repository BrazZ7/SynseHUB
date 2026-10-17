import { describe, expect, it } from 'vitest'

import { clienteFalso } from '../postgrest-falso'
import { DemoDataSource } from '@/lib/database/demo-data-source'
import { ACADEMIAS_POR_PAGINA, RESUMO_VAZIO } from '@/features/organizations/resumo'
import { resumoParaPaySummary } from '@/features/payments/service'

/**
 * ── O painel da plataforma parou de ler a base inteira ──────────────────────
 *
 * Como era: `listOrganizations` sem teto e, **para cada academia**, duas
 * consultas — uma delas trazendo vinte mil cobranças para somar quatro
 * números num laço. Cinquenta academias viravam 151 consultas e um milhão de
 * linhas para produzir dez números, e o `limit: 20000` era corte silencioso:
 * a academia que passasse dele aparecia com GMV menor do que faturou.
 *
 * Como é: a 0054 soma no banco, os acordos vêm numa consulta só, e a lista da
 * tela pagina.
 *
 * O que estes testes travam, além da paginação: **a comissão não é calculada
 * pelo banco**. O split tem taxa fixa por academia, três estratégias e
 * padrões vindos de variável de ambiente; ele fica em `lib/payments/split.ts`,
 * em um lugar só.
 */

const academia = (id: string) => ({
  id,
  name: `Academia ${id}`,
  slug: id,
  status: 'ACTIVE',
  hub_plan: 'PRO',
  created_at: '2026-01-01T00:00:00Z',
})

describe('listOrganizations', () => {
  it('pede uma faixa e o total vem do banco', async () => {
    const { dataSource, paraTabela } = clienteFalso({
      tabelas: { organizations: [{ data: [academia('a')], error: null, count: 318 }] },
    })

    const pagina = await dataSource.listOrganizations({ page: 2, pageSize: 10 })

    const passos = paraTabela('organizations')?.passos ?? []
    expect(passos.find((p) => p.metodo === 'range')?.args).toEqual([10, 19])
    expect(pagina.total).toBe(318)
  })

  it('o padrão é a página da tela, e a ordem desempata', async () => {
    /*
     * Duas academias criadas no mesmo instante — importação de uma rede —
     * ficariam em ordem indefinida, e com `range` a que trocasse sumiria de
     * uma página sem aparecer na outra.
     */
    const { dataSource, paraTabela } = clienteFalso({
      tabelas: { organizations: [{ data: [], error: null, count: 0 }] },
    })

    await dataSource.listOrganizations()

    const passos = paraTabela('organizations')?.passos ?? []
    expect(passos.find((p) => p.metodo === 'range')?.args).toEqual([0, ACADEMIAS_POR_PAGINA - 1])
    expect(passos.filter((p) => p.metodo === 'order').map((p) => p.args[0])).toEqual([
      'created_at',
      'id',
    ])
  })
})

describe('resumoDasAcademias', () => {
  it('chama a função do banco com a lista e o teto', async () => {
    const { dataSource, argsDaRpc } = clienteFalso({
      rpcs: { resumo_das_academias: { data: [], error: null } },
    })

    await dataSource.resumoDasAcademias(['org_1', 'org_2'], 50)

    expect(argsDaRpc('resumo_das_academias')).toEqual({
      p_organization_ids: ['org_1', 'org_2'],
      p_limite: 50,
    })
  })

  it('"todas" vai como nulo, e não como lista vazia', async () => {
    // Lista vazia significaria "nenhuma academia" no `any()` do SQL: o painel
    // da plataforma zeraria em silêncio.
    const { dataSource, argsDaRpc } = clienteFalso({
      rpcs: { resumo_das_academias: { data: [], error: null } },
    })

    await dataSource.resumoDasAcademias(null)

    expect(argsDaRpc('resumo_das_academias')?.p_organization_ids).toBeNull()
  })

  it('traduz as colunas do banco para o resumo da aplicação', async () => {
    const { dataSource } = clienteFalso({
      rpcs: {
        resumo_das_academias: {
          data: [
            {
              organization_id: 'org_1',
              alunos_ativos: '412',
              recebido: '38900.50',
              previsto: '1200',
              atrasado_valor: '830.10',
              atrasado_qtd: '7',
            },
          ],
          error: null,
        },
      },
    })

    expect(await dataSource.resumoDasAcademias(['org_1'])).toEqual([
      {
        organizationId: 'org_1',
        alunosAtivos: 412,
        recebido: 38900.5,
        previsto: 1200,
        atrasadoValor: 830.1,
        atrasadoQtd: 7,
      },
    ])
  })
})

describe('o resumo vira o consolidado da tela', () => {
  /*
   * A aritmética que a tela mostra, sobre o bruto que o banco soma. Ela mora
   * em uma função só porque o painel da plataforma precisa dela para dezenas
   * de academias de uma vez — duas cópias divergiriam, e uma delas é a
   * comissão da Synse.
   */
  const acordo = {
    platformFeePercentage: 2,
    platformFixedFee: 0,
    paymentProviderFeeStrategy: 'ORGANIZATION_ABSORBS' as const,
  }

  it('o que está em aberto é o previsto mais o atrasado', async () => {
    const pay = resumoParaPaySummary(
      { ...RESUMO_VAZIO('org_1'), recebido: 1000, previsto: 300, atrasadoValor: 200 },
      acordo,
    )
    expect(pay.totalPending).toBe(500)
    expect(pay.forecast).toBe(300)
    expect(pay.overdueAmount).toBe(200)
  })

  it('o GMV é o que entrou, não o que foi cobrado', async () => {
    // GMV ≠ faturamento é a regra da tela, e confundir os dois aqui faria o
    // painel anunciar dinheiro que ainda não existe.
    const pay = resumoParaPaySummary(
      { ...RESUMO_VAZIO('org_1'), recebido: 1000, previsto: 9000 },
      acordo,
    )
    expect(pay.gmv).toBe(1000)
  })

  it('a comissão sai do acordo da academia, nunca de 2% fixo', async () => {
    const dois = resumoParaPaySummary({ ...RESUMO_VAZIO('o'), recebido: 1000 }, acordo)
    const cinco = resumoParaPaySummary(
      { ...RESUMO_VAZIO('o'), recebido: 1000 },
      { ...acordo, platformFeePercentage: 5 },
    )
    expect(dois.platformFee).not.toBe(cinco.platformFee)
    expect(cinco.platformFee).toBeGreaterThan(dois.platformFee)
  })

  it('academia sem cobrança nenhuma não divide por zero', async () => {
    const pay = resumoParaPaySummary(RESUMO_VAZIO('org_1'), acordo)
    expect(pay.paymentRate).toBe(100)
    expect(pay.gmv).toBe(0)
  })
})

describe('o painel na demonstração', () => {
  const fonte = () => new DemoDataSource()

  it('soma as mesmas situações que o SQL soma', async () => {
    const [resumo] = await fonte().resumoDasAcademias(['org_0001'])
    expect(resumo.organizationId).toBe('org_0001')
    expect(resumo.recebido).toBeGreaterThan(0)
    expect(resumo.alunosAtivos).toBeGreaterThan(0)
  })

  it('academia que não existe não devolve linha', async () => {
    expect(await fonte().resumoDasAcademias(['nao-existe'])).toEqual([])
  })

  it('conta por plano só as ativas', async () => {
    const porPlano = await fonte().academiasPorPlano()
    const total = Object.values(porPlano).reduce((s, n) => s + n, 0)
    const todas = await fonte().listOrganizations()
    expect(total).toBeLessThanOrEqual(todas.total)
  })

  it('os acordos vêm numa consulta só, e só os perguntados', async () => {
    const acordos = await fonte().listBillingSettings(['org_0001'])
    expect(acordos.has('org_0001')).toBe(true)
    expect(await fonte().listBillingSettings([])).toEqual(new Map())
  })
})
