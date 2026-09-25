import type { Metadata } from 'next'

import { BackLink } from '@/components/synse/back-link'
import { PageHeader } from '@/components/synse/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { ContentForm } from '@/features/content/content-form'
import { requireHubSession } from '@/lib/auth/require-session'

export const metadata: Metadata = { title: 'Novo conteúdo' }

export default async function NewContentPage() {
  await requireHubSession('content:write')

  return (
    <div className="mx-auto max-w-3xl space-y-5 animate-fade-in-up">
      <BackLink href="/content" label="Conteúdos" />
      <PageHeader
        title="Novo conteúdo"
        description="Sem data de publicação fica como rascunho — só a equipe enxerga até você publicar."
      />
      <Card>
        <CardContent className="pt-5">
          <ContentForm />
        </CardContent>
      </Card>
    </div>
  )
}
