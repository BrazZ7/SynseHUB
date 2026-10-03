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

  /*
   * ── O aluno que veio da ficha ─────────────────────────────────────────────
   *
   * `?aluno=` chega quando alguém apertou "Novo plano" na ficha de alguém, e
   * só vira pré-seleção depois de o servidor confirmar que o id é mesmo um
   * aluno desta academia: `getStudent` recebe a academia da sessão e a RLS
   * confere por cima. Quem recusa na gravação é `saveNutritionPlanAction`.
   *
   * A lista de alunos não é mais carregada aqui. Ela parava em 100
   * (`Math.min(100, …)` nos dois data sources) e o `pageSize: 300` que esta
   * página pedia não mudava nada — numa academia com 478 ativos, o `select`
   * oferecia os 100 primeiros em ordem alfabética e calava sobre o resto.
   * Quem escolhe agora é `SeletorDeAluno`, que busca no servidor.
   */
  const daFicha = aluno ? await dataSource.getStudent(session.organizationId, aluno) : null

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
            alunoInicial={daFicha && { id: daFicha.id, name: daFicha.name }}
          />
        </CardContent>
      </Card>
    </div>
  )
}
