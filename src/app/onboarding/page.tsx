import type { Metadata } from 'next'

import { SynseLogo } from '@/components/synse/synse-logo'
import { OnboardingForm } from '@/features/onboarding/onboarding-form'
import { requireOnboarding } from '@/lib/auth/require-session'
import { createSupabaseServerClient } from '@/lib/database/supabase-server'

export const metadata: Metadata = { title: 'Cadastrar academia' }

/*
 * Nunca estática: a página decide o que mostrar a partir de quem está
 * autenticado. Sem isto, num ambiente onde a checagem retorna cedo, o Next a
 * pré-renderiza no build e serve o mesmo HTML para todo mundo.
 */
export const dynamic = 'force-dynamic'

export default async function OnboardingPage() {
  await requireOnboarding()

  // O nome veio no cadastro da conta; aqui só preenche o campo por cortesia.
  const supabase = await createSupabaseServerClient()
  const { data } = (await supabase?.auth.getUser()) ?? { data: { user: null } }
  const suggestedName = (data.user?.user_metadata?.name as string | undefined) ?? ''

  return (
    <main className="mx-auto flex min-h-svh max-w-lg flex-col justify-center gap-8 px-5 py-12">
      <SynseLogo size="md" />

      <header className="space-y-1.5">
        <h1 className="text-page-title font-semibold text-synse-text">Falta pouco</h1>
        <p className="text-sm text-synse-muted">
          Conta criada. Agora informe os dados da academia para abrir o painel.
        </p>
      </header>

      <OnboardingForm defaultOwnerName={suggestedName} />
    </main>
  )
}
