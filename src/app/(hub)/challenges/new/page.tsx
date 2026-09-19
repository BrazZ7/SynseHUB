import type { Metadata } from 'next'

import { BackLink } from '@/components/synse/back-link'
import { PageHeader } from '@/components/synse/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { GymChallengeForm } from '@/features/gym-challenges/challenge-form'
import { requireHubSession } from '@/lib/auth/require-session'

export const metadata: Metadata = { title: 'Novo desafio' }

export default async function NewChallengePage() {
  await requireHubSession('challenges:write')

  return (
    <div className="mx-auto max-w-2xl space-y-5 animate-fade-in-up">
      <BackLink href="/challenges" label="Desafios" />
      <PageHeader
        title="Novo desafio"
        description="O progresso é contado pelo sistema — pelo check-in, pelo treino registrado e pela chamada da aula. O aluno não digita nada."
      />
      <Card>
        <CardContent className="pt-5">
          <GymChallengeForm hoje={new Date().toISOString().slice(0, 10)} />
        </CardContent>
      </Card>
    </div>
  )
}
