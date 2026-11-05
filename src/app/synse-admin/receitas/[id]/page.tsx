import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { BackLink } from '@/components/synse/back-link'
import { PageHeader } from '@/components/synse/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ApagarReceita } from '@/features/recipes/apagar-receita'
import { RecipeForm } from '@/features/recipes/recipe-form'
import { requirePlatformSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'

export const metadata: Metadata = { title: 'Editar receita' }

export default async function EditarReceitaPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformSession()
  const { id } = await params

  const dataSource = await getDataSource()
  /*
   * A conta de plataforma lê a receita do Synse+ pelo `or is_super_admin()`
   * que a 0044 pôs em `recipes_read` — sem ele, esta tela abriria 404 logo
   * depois de publicar.
   */
  const receita = await dataSource.getRecipe(id)
  if (!receita) notFound()

  return (
    <div className="animate-fade-in-up space-y-6">
      <div>
        <BackLink href="/synse-admin/receitas" label="Receitas" />
        <PageHeader eyebrow="Plataforma" title={receita.title} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>A receita</CardTitle>
        </CardHeader>
        <CardContent>
          <RecipeForm receita={receita} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Apagar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-synse-muted">
            Apagar tira a receita da biblioteca de toda a base, na hora. Não há como desfazer.
          </p>
          <ApagarReceita recipeId={receita.id} />
        </CardContent>
      </Card>
    </div>
  )
}
