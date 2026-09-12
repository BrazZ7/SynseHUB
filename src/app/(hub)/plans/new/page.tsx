import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

import { PageHeader } from '@/components/synse/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { NewPlanForm } from '@/features/plans/new-plan-form'
import { requireHubSession } from '@/lib/auth/require-session'

export const metadata: Metadata = { title: 'Novo plano' }

export default async function NewPlanPage() {
  // A permissão é exigida já na entrada da rota: sem isto, quem não pode criar
  // plano ainda veria o formulário e só descobriria no envio.
  await requireHubSession('plans:write')

  return (
    <div className="mx-auto max-w-3xl space-y-5 animate-fade-in-up">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/plans">
          <ChevronLeft className="size-4" />
          Planos
        </Link>
      </Button>

      <PageHeader
        title="Novo plano"
        description="O plano define o valor da mensalidade e a periodicidade da cobrança. É o que a matrícula do aluno aponta."
      />

      <Card>
        <CardContent className="pt-5">
          <NewPlanForm />
        </CardContent>
      </Card>
    </div>
  )
}
