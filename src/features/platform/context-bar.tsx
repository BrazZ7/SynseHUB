import { ContextSwitcher } from '@/features/platform/context-switcher'
import type { ContextoDisponivel } from '@/features/platform/state'
import { CONTEXTO_PESSOAL, SYNSE_PLATFORM_ORG_ID, type SessionContext } from '@/lib/auth/session'
import { getDataSource } from '@/lib/database'
import { isPendingMigration } from '@/lib/database/pending-migration'
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

  const opcoes: ContextoDisponivel[] = [
    {
      valor: CONTEXTO_PESSOAL,
      rotulo: 'Conta pessoal',
      detalhe: 'Seu app de aluno',
      tipo: 'PESSOAL',
    },
    ...academias.map(
      (org): ContextoDisponivel => ({
        valor: org.id,
        rotulo: org.name,
        detalhe: org.slug,
        tipo: 'ACADEMIA',
      }),
    ),
  ]

  const emAcademia = session.role === 'SUPER_ADMIN' && academias.some((o) => o.id === session.organizationId)

  return (
    <ContextSwitcher
      atual={emAcademia ? session.organizationId : CONTEXTO_PESSOAL}
      opcoes={opcoes}
      emAcademiaDeCliente={emAcademia}
    />
  )
}
