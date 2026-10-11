import { describe, expect, it } from 'vitest'

import { AVALIACOES_NA_FICHA } from '@/features/assessments/janela'
import { DemoDataSource } from '@/lib/database/demo-data-source'
import { DEMO_ORG_ID } from '@/lib/database/demo-seed'
import { clienteFalso } from '../postgrest-falso'

/**
 * ── O histórico de avaliações com teto escrito ──────────────────────────────
 *
 * `listAssessments` lia o histórico inteiro de um aluno e a ficha usava essa
 * leitura para três coisas: a variação de peso, o gráfico e a altura vigente.
 *
 * Paginar não resolvia — gráfico não tem página. Mas o gráfico também não quer
 * o histórico inteiro: a lição da 0052 é que mandar milhares de linhas para
 * desenhar trezentos pixels é o que aproxima o teto. Então o teto passou a ser
 * **escrito**: a tela pede a janela que desenha e diz na legenda qual é.
 *
 * E as duas telas do app do aluno que liam tudo para achar a altura passaram a
 * pedir uma linha.
 */
const fonte = () => new DemoDataSource([])

/**
 * Um aluno da semente que tenha histórico.
 *
 * Procura em vez de fixar um id: só os primeiros alunos detalhados da semente
 * têm avaliações, e `listStudents` ordena por nome — qual deles cai em qual
 * posição é detalhe da semente, não contrato. Um id fixo aqui quebraria no dia
 * em que alguém trocasse um nome.
 */
async function umAlunoComAvaliacoes() {
  const f = fonte()
  const { rows } = await f.listStudents(DEMO_ORG_ID, { page: 1, pageSize: 500 })
  for (const aluno of rows) {
    const avaliacoes = await f.listAssessments(DEMO_ORG_ID, aluno.id, { limite: 500 })
    if (avaliacoes.length >= 2) return { alunoId: aluno.id, avaliacoes }
  }
  throw new Error('a semente precisa de um aluno com ao menos duas avaliações')
}

describe('a demonstração diz qual é a resposta certa', () => {
  it('o recorte pega as MAIS RECENTES, e não as mais antigas', async () => {
    /*
     * A armadilha: `limit` corta pelo fim da ordenação. Ascendente, ele
     * devolveria as mais antigas e o gráfico mostraria 2021 em vez dos
     * últimos dois anos.
     */
    const { alunoId, avaliacoes } = await umAlunoComAvaliacoes()
    const recorte = await fonte().listAssessments(DEMO_ORG_ID, alunoId, { limite: 1 })

    expect(recorte).toHaveLength(1)
    expect(recorte[0].id).toBe(avaliacoes[avaliacoes.length - 1].id)
  })

  it('e devolve em ordem crescente, que é como o gráfico desenha', async () => {
    const { alunoId } = await umAlunoComAvaliacoes()
    const recorte = await fonte().listAssessments(DEMO_ORG_ID, alunoId, { limite: 10 })

    const datas = recorte.map((a) => a.assessedAt)
    expect(datas).toEqual([...datas].sort())
  })

  it('`comAltura` devolve só o que tem altura', async () => {
    const { alunoId } = await umAlunoComAvaliacoes()
    const comAltura = await fonte().listAssessments(DEMO_ORG_ID, alunoId, {
      comAltura: true,
      limite: 500,
    })

    expect(comAltura.every((a) => a.height != null)).toBe(true)
  })

  it('sem limite pedido, o padrão é a janela da ficha — nunca o histórico todo', async () => {
    const { alunoId } = await umAlunoComAvaliacoes()
    const padrao = await fonte().listAssessments(DEMO_ORG_ID, alunoId)

    expect(padrao.length).toBeLessThanOrEqual(AVALIACOES_NA_FICHA)
  })
})

describe('o que o caminho do Supabase pede ao servidor', () => {
  const passos = (c: { passos: { metodo: string; args: unknown[] }[] } | undefined) =>
    c?.passos ?? []

  it('manda um limite e pede do mais novo para o mais velho', async () => {
    const { dataSource, paraTabela } = clienteFalso({
      tabelas: { assessments: [{ data: [], error: null }] },
    })

    await dataSource.listAssessments('org_1', 'aluno_1', { limite: 24 })

    const chamada = paraTabela('assessments')
    expect(passos(chamada).find((p) => p.metodo === 'limit')?.args).toEqual([24])
    // Decrescente: é o que faz o corte pegar as recentes.
    expect(passos(chamada).find((p) => p.metodo === 'order')?.args).toEqual([
      'assessed_at',
      { ascending: false },
    ])
  })

  it('o resultado volta invertido, para a tela receber em ordem crescente', async () => {
    const linha = (id: string, quando: string) => ({
      id,
      organization_id: 'org_1',
      student_id: 'aluno_1',
      assessed_at: quando,
    })
    const { dataSource } = clienteFalso({
      tabelas: {
        assessments: [
          {
            data: [linha('nova', '2026-10-01'), linha('velha', '2026-01-01')],
            error: null,
          },
        ],
      },
    })

    const avaliacoes = await dataSource.listAssessments('org_1', 'aluno_1')
    expect(avaliacoes.map((a) => a.id)).toEqual(['velha', 'nova'])
  })

  it('`comAltura` vira filtro no servidor, e não peneira depois', async () => {
    const { dataSource, paraTabela } = clienteFalso({
      tabelas: { assessments: [{ data: [], error: null }] },
    })

    await dataSource.listAssessments('org_1', 'aluno_1', { comAltura: true, limite: 1 })

    expect(
      passos(paraTabela('assessments')).some(
        (p) => p.metodo === 'not' && p.args[0] === 'height' && p.args[1] === 'is',
      ),
    ).toBe(true)
  })

  it('sem opção nenhuma, o limite é o da ficha — e existe', async () => {
    // O ponto da mudança: nunca mais uma leitura sem teto nesta rota.
    const { dataSource, paraTabela } = clienteFalso({
      tabelas: { assessments: [{ data: [], error: null }] },
    })

    await dataSource.listAssessments('org_1', 'aluno_1')

    expect(passos(paraTabela('assessments')).find((p) => p.metodo === 'limit')?.args).toEqual([
      AVALIACOES_NA_FICHA,
    ])
  })
})
