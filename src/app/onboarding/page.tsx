import type { Metadata } from 'next'

import { SynseLogo } from '@/components/synse/synse-logo'
import { parseAccountType } from '@/features/auth/account-type'
import { JoinGymForm } from '@/features/onboarding/join-gym-form'
import { OnboardingForm } from '@/features/onboarding/onboarding-form'
import { requireOnboarding } from '@/lib/auth/require-session'
import { createSupabaseServerClient } from '@/lib/database/supabase-server'

export const metadata: Metadata = { title: 'Falta pouco' }

/*
 * Nunca estática: a página decide o que mostrar a partir de quem está
 * autenticado. Sem isto, num ambiente onde a checagem retorna cedo, o Next a
 * pré-renderiza no build e serve o mesmo HTML para todo mundo.
 */
export const dynamic = 'force-dynamic'

const COPY = {
  academia: {
    titulo: 'Falta pouco',
    descricao: 'Conta criada. Agora informe os dados da academia para abrir o painel.',
  },
  profissional: {
    titulo: 'Falta pouco',
    descricao: 'Conta criada. Agora dê um nome ao seu espaço para abrir o painel.',
  },
  aluno: {
    titulo: 'Entre na sua academia',
    descricao: 'Conta criada. Informe o código que a academia te passou.',
  },
} as const

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>
}) {
  await requireOnboarding()

  /*
   * O tipo chega pela URL, que veio do cadastro — e sobrevive à ida até a caixa
   * de entrada. Quem cair aqui sem ele é tratado como academia, que era o único
   * caminho existente antes destas três portas.
   */
  const tipo = parseAccountType((await searchParams).tipo) ?? 'academia'

  // O nome veio no cadastro da conta; aqui só preenche o campo por cortesia.
  const supabase = await createSupabaseServerClient()
  const { data } = (await supabase?.auth.getUser()) ?? { data: { user: null } }
  const suggestedName = (data.user?.user_metadata?.name as string | undefined) ?? ''

  const copy = COPY[tipo]

  return (
    <main className="mx-auto flex min-h-svh max-w-lg flex-col justify-center gap-8 px-5 py-12">
      <SynseLogo size="md" />

      <header className="space-y-1.5">
        <h1 className="text-page-title font-semibold text-synse-text">{copy.titulo}</h1>
        <p className="text-sm text-synse-muted">{copy.descricao}</p>
      </header>

      {tipo === 'aluno' ? (
        <JoinGymForm defaultName={suggestedName} />
      ) : (
        <OnboardingForm defaultOwnerName={suggestedName} accountType={tipo} />
      )}
    </main>
  )
}
