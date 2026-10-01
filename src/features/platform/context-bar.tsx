import Link from 'next/link'
import { Library } from 'lucide-react'

import { ContextSwitcher } from '@/features/platform/context-switcher'
import type { ContextoDisponivel } from '@/features/platform/state'
import { CONTEXTO_PESSOAL, SYNSE_PLATFORM_ORG_ID, type SessionContext } from '@/lib/auth/session'
import { getDataSource } from '@/lib/database'
import { isPendingMigration } from '@/lib/database/pending-migration'
import { createSupabaseServerClient } from '@/lib/database/supabase-server'
import { SYNSE_SOLO_ORG_ID } from '@/lib/organizations/solo'

/**
 * A barra de contexto, montada nos dois lados do produto.
 *
 * Não desenha nada para conta comum — e essa é a regra mais importante aqui:
 * quem não é conta de plataforma nunca vê que o seletor existe. A checagem
 * está na sessão, que consulta o banco, e não num sinalizador do cliente.
 */
export async function ContextBar({ session }: { session: SessionContext }) {
  if (!session.isPlatformAccount) return null

  let academias: { id: string; name: string; slug: string }[] = []
  try {
    const dataSource = await getDataSource()
    const todas = await dataSource.listOrganizations()
    academias = todas
      /*
       * As duas organizações reservadas ficam de fora. A da plataforma existe
       * só para hospedar o papel, e a dos alunos solo não é academia de
       * ninguém — entrar nelas não mostraria nada de útil.
       */
      .filter((org) => org.id !== SYNSE_PLATFORM_ORG_ID && org.id !== SYNSE_SOLO_ORG_ID)
      .map((org) => ({ id: org.id, name: org.name, slug: org.slug }))
  } catch (erro) {
    if (!isPendingMigration(erro)) throw erro
  }

  /*
   * "Conta pessoal" só entra na lista se existir matrícula.
   *
   * Oferecer o contexto pessoal a quem nunca foi aluno de nada devolveria a
   * pessoa ao painel — o mesmo sintoma de botão que não responde que esta
   * tela existe para resolver. Melhor não oferecer do que oferecer e não ir.
   */
  const temMatricula = await contaTemMatricula(session.userProfileId)

  const opcoes: ContextoDisponivel[] = [
    ...(temMatricula
      ? [
          {
            valor: CONTEXTO_PESSOAL,
            rotulo: 'Conta pessoal',
            detalhe: 'Seu app de aluno',
            tipo: 'PESSOAL' as const,
          },
        ]
      : []),
    ...academias.map((org): ContextoDisponivel => ({
      valor: org.id,
      rotulo: org.name,
      detalhe: org.slug,
      tipo: 'ACADEMIA',
    })),
  ]

  const emAcademia =
    session.role === 'SUPER_ADMIN' && academias.some((o) => o.id === session.organizationId)

  return (
    <div className="flex items-start gap-2">
      {/*
       * ── O caminho que não existia ─────────────────────────────────────────
       *
       * `/synse-admin` não era linkado de lugar nenhum. A conta de plataforma
       * entrava, caía no painel da academia e só chegava lá digitando o
       * endereço — então, na prática, publicar no acervo era impossível para
       * quem não decorou a URL. A 0039 abriu a porta e ninguém pôs a maçaneta.
       *
       * Fica aqui, e não na navegação lateral, porque esta barra já é a faixa
       * que só a conta de plataforma enxerga: a verificação é a mesma de
       * sempre (`isPlatformAccount`, lá em cima, consultada no banco) e não
       * precisa ser repetida num terceiro lugar.
       */}
      <Link
        href="/synse-admin"
        className="inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border border-synse-border bg-synse-surface px-3 text-sm font-medium text-synse-text transition-colors hover:bg-synse-surface-2"
      >
        <Library className="size-4 text-synse-primary" aria-hidden />
        Plataforma
      </Link>

      <ContextSwitcher
        atual={emAcademia ? session.organizationId : CONTEXTO_PESSOAL}
        opcoes={opcoes}
        emAcademiaDeCliente={emAcademia}
      />
    </div>
  )
}

/** A conta tem alguma matrícula de aluno? */
async function contaTemMatricula(userProfileId: string): Promise<boolean> {
  try {
    const supabase = await createSupabaseServerClient()
    // Sem Supabase é modo de demonstração, onde a persona sempre tem matrícula.
    if (!supabase) return true

    const { data } = await supabase
      .from('students')
      .select('id')
      .eq('user_profile_id', userProfileId)
      .limit(1)
      .maybeSingle()

    return data != null
  } catch {
    // Na dúvida, oferece: esconder uma opção legítima é pior que oferecer uma
    // que talvez não leve a lugar nenhum.
    return true
  }
}
