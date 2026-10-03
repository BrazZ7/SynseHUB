import type { Metadata } from 'next'

import { BackLink } from '@/components/synse/back-link'
import { PageHeader } from '@/components/synse/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { NutritionPlanEditor } from '@/features/nutrition/plan-editor'
import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'

export const metadata: Metadata = { title: 'Novo plano alimentar' }

type Search = Promise<{ aluno?: string }>

export default async function NewNutritionPlanPage({ searchParams }: { searchParams: Search }) {
  const session = await requireHubSession('nutrition:write')
  const { aluno } = await searchParams
  const dataSource = await getDataSource()
  const alunos = await dataSource.listStudents(session.organizationId, {
    status: 'ACTIVE',
    page: 1,
    pageSize: 300,
  })

  /*
   * ── O aluno que veio da ficha ─────────────────────────────────────────────
   *
   * `?aluno=` chega quando alguém apertou "Novo plano" na ficha de alguém, e
   * só vira pré-seleção depois de o servidor confirmar que o id é mesmo um
   * aluno desta academia. Um id colado na barra de endereços não atravessa:
   * `getStudent` recebe a academia da sessão e a RLS confere por cima, e quem
   * recusa de verdade na gravação é `saveNutritionPlanAction`.
   *
   * ── Por que buscar de novo, se a lista já veio ────────────────────────────
   *
   * Porque a lista **não tem todos**. `listStudents` limita a página a 100
   * (`Math.min(100, …)` nos dois data sources), e o `pageSize: 300` acima não
   * muda isso — numa academia com 478 alunos ativos, o `select` oferece os
   * 100 primeiros em ordem alfabética e os outros não existem para esta tela.
   *
   * Isto conserta só o caminho que vem da ficha: quem foi escolhido lá entra
   * na lista mesmo estando fora dos 100. **O seletor continua truncado para
   * quem chega por `/nutrition/new` direto**, e o mesmo vale para avaliações,
   * atribuição de treino, reserva de aula e o console de check-in — está
   * relatado, e não é conserto de uma linha: o certo é um campo de busca, não
   * um `select` com a academia inteira dentro.
   */
  const daFicha = aluno ? await dataSource.getStudent(session.organizationId, aluno) : null
  const alunoInicial = daFicha?.id

  const opcoes = alunos.rows.map((item) => ({ id: item.id, name: item.name }))
  if (daFicha && !opcoes.some((o) => o.id === daFicha.id)) {
    opcoes.unshift({ id: daFicha.id, name: daFicha.name })
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 animate-fade-in-up">
      <BackLink href="/nutrition" label="Nutrição" />
      <PageHeader
        title="Novo plano alimentar"
        description="Salva como rascunho. O aluno só enxerga depois que você publicar — plano meio escrito no app é pior que nenhum."
      />
      <Card>
        <CardContent className="pt-5">
          <NutritionPlanEditor
            alunos={opcoes}
            alunoInicial={alunoInicial}
          />
        </CardContent>
      </Card>
    </div>
  )
}
