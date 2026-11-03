import type { Metadata } from 'next'

import { BackLink } from '@/components/synse/back-link'
import { ColunaDeLeitura } from '@/components/synse/duas-colunas'
import { PageHeader } from '@/components/synse/page-header'
import { Lobby } from '@/features/squad/lobby'
import { SemEsquadrao } from '@/features/squad/sem-esquadrao'
import { requireStudentSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { seAindaNaoMigrou } from '@/lib/database/pending-migration'
import type { Squad, SquadMember, SquadSession } from '@/types/domain'

export const metadata: Metadata = { title: 'Esquadrão' }

/** Dez treinos: o de ontem, os da semana e um pouco além. */
const SESSOES = 10

export default async function EsquadraoPage() {
  const session = await requireStudentSession()
  const dataSource = await getDataSource()

  /*
   * `seAindaNaoMigrou` porque a 0068 pode não ter sido colada ainda. Lista
   * vazia leva à tela de "entrar com um código", que é o estado honesto nesse
   * intervalo: sem as tabelas, ninguém tem esquadrão mesmo. Tentar entrar
   * mostra o erro de verdade, em vez de a tela inteira quebrar.
   */
  const esquadroes = await dataSource.listSquads().catch(seAindaNaoMigrou<Squad[]>([]))
  const esquadrao = esquadroes[0] ?? null

  if (!esquadrao) {
    return (
      <ColunaDeLeitura className="animate-fade-in-up space-y-4">
        <BackLink href="/app" label="Hoje" />
        <PageHeader
          title="Esquadrão"
          description="O grupo que treina junto: quem chegou, o que está marcado e a semana de todo mundo."
        />
        <SemEsquadrao />
      </ColunaDeLeitura>
    )
  }

  const [membros, sessoes, fichas] = await Promise.all([
    dataSource.getSquadLobby(esquadrao.id).catch(seAindaNaoMigrou<SquadMember[]>([])),
    dataSource.listSquadSessions(esquadrao.id, SESSOES).catch(seAindaNaoMigrou<SquadSession[]>([])),
    /*
     * As fichas que esta pessoa pode mandar — as atribuídas a ela. O banco
     * ainda confere que a ficha é de uma academia dela (0068); esta lista é
     * só o que o seletor oferece.
     */
    dataSource
      .listAssignmentsForStudent(session.organizationId, session.studentId)
      .then(async (atribuicoes) => {
        if (atribuicoes.length === 0) return []
        const planos = await dataSource.listWorkoutPlansByIds(
          session.organizationId,
          atribuicoes.map((a) => a.workoutPlanId),
        )
        return planos.map((p) => ({ id: p.id, nome: p.name }))
      })
      .catch(seAindaNaoMigrou<Array<{ id: string; nome: string }>>([])),
  ])

  const eu = membros.find((m) => m.souEu)

  return (
    <ColunaDeLeitura className="animate-fade-in-up space-y-4">
      <BackLink href="/app" label="Hoje" />
      <PageHeader
        title={esquadrao.nome}
        description="Quem chegou, o que está marcado e a semana de todo mundo."
      />

      <Lobby
        esquadrao={esquadrao}
        membros={membros}
        sessoes={sessoes}
        fichas={fichas}
        meuPerfilId={eu?.profileId ?? ''}
      />
    </ColunaDeLeitura>
  )
}
