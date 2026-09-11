import type { Metadata } from 'next'
import Link from 'next/link'

import { SynseLogo } from '@/components/synse/synse-logo'
import { AccountTypePicker } from '@/features/auth/account-type-picker'
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

  // O nome veio no cadastro da conta; aqui só preenche o campo por cortesia.
  const supabase = await createSupabaseServerClient()
  const { data } = (await supabase?.auth.getUser()) ?? { data: { user: null } }
  const suggestedName = (data.user?.user_metadata?.name as string | undefined) ?? ''

  /*
   * O perfil é perguntado aqui, com a pessoa já autenticada e o e-mail
   * confirmado — não no cadastro.
   *
   * Perguntar antes obrigava a resposta a atravessar a criação de senha, o
   * e-mail de confirmação e a volta para o site, e ela se perdia em cada um
   * desses trechos: quem escolhia "sou aluno" e voltava por link de e-mail caía
   * num formulário pedindo CNPJ.
   */
  const tipo = parseAccountType((await searchParams).tipo)

  if (!tipo) {
    return (
      <main className="mx-auto flex min-h-svh max-w-lg flex-col justify-center gap-8 px-5 py-12">
        <SynseLogo size="md" />

        <header className="space-y-1.5">
          <h1 className="text-page-title font-semibold text-synse-text">
            Conta confirmada. O que você faz?
          </h1>
          <p className="text-sm text-synse-muted">
            A próxima tela depende da sua resposta, então é a única coisa que perguntamos agora.
          </p>
        </header>

        <AccountTypePicker />
      </main>
    )
  }

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

      {/*
        Saída para quem caiu no formulário errado — por ter escolhido às pressas
        ou porque o perfil na conta não é mais o que a pessoa quer agora.
      */}
      <p className="text-center text-sm text-synse-muted">
        Escolheu errado?{' '}
        <Link href="/onboarding" className="text-synse-primary underline-offset-2 hover:underline">
          Voltar e trocar
        </Link>
      </p>
    </main>
  )
}
