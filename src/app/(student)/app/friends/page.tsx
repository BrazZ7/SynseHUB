import type { Metadata } from 'next'
import Link from 'next/link'
import { Lock, Users } from 'lucide-react'

import { BackLink } from '@/components/synse/back-link'
import { ConsentList } from '@/features/consents/consent-list'
import { DIAS_DO_RANKING } from '@/features/friends/state'
import { FriendsPanel } from '@/features/friends/friends-panel'
import { requireStudentSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { isPendingMigration } from '@/lib/database/pending-migration'
import { resumoDaAssinatura } from '@/lib/plans/subscription'
import type { ConsentState, Friend, FriendRankRow } from '@/types/domain'

export const metadata: Metadata = { title: 'Amigos' }

/**
 * Amigos e o ranking entre eles — a última promessa do Synse+ que dava para
 * cumprir com código.
 *
 * ── Duas autorizações diferentes, e a tela precisa das duas ─────────────────
 *
 * A do **plano**: o ranking é do Synse+, e quem não assina vê o convite.
 * A da **pessoa**: aparecer num ranking é publicar métrica pessoal, e isso
 * exige consentimento explícito — que mora em `consents`, com a mesma trilha
 * de versão e data dos outros.
 *
 * Por isso o controle de privacidade vem junto, no fim da página, e não
 * escondido em Perfil: quem chega aqui é exatamente quem precisa decidir.
 */
export default async function FriendsPage() {
  const session = await requireStudentSession()
  const resumo = resumoDaAssinatura(session.plus)

  if (!resumo.ativa) {
    return (
      <div className="animate-fade-in-up space-y-5">
        <BackLink href="/app/progress" label="Progresso" />
        <header>
          <h1 className="text-2xl font-semibold text-synse-text">Amigos</h1>
        </header>
        <Link
          href="/app/synse"
          className="flex items-start gap-2.5 rounded-2xl border border-synse-border bg-synse-surface p-5 text-sm text-synse-text shadow-synse-sm transition-colors hover:border-synse-primary"
        >
          <Lock className="mt-0.5 size-4 shrink-0 text-synse-primary" aria-hidden />
          <span>
            <strong className="font-medium">O ranking entre amigos é do Synse+.</strong> Você
            adiciona quem quiser pelo Synse ID e compara os treinos do mês — e ninguém aparece
            sem autorizar.
          </span>
        </Link>
      </div>
    )
  }

  const dataSource = await getDataSource()
  const ate = new Date()
  const de = new Date(ate.getTime() - DIAS_DO_RANKING * 86_400_000)

  /*
   * Publicar não é migrar: entre o deploy e o SQL colado no Supabase, este
   * código fala com um banco que ainda não tem `friendships`. A tela aparece
   * vazia em vez de quebrar, e `/api/health?deep=1` denuncia a pendência.
   */
  let amigos: Friend[] = []
  let ranking: FriendRankRow[] = []
  let consents: ConsentState[] = []
  let indisponivel = false

  try {
    ;[amigos, ranking, consents] = await Promise.all([
      dataSource.listFriends(),
      dataSource.getFriendsRanking(de.toISOString(), ate.toISOString()),
      dataSource.listConsents(session.userProfileId),
    ])
  } catch (erro) {
    if (!isPendingMigration(erro)) throw erro
    indisponivel = true
  }

  const rankingDaPrivacidade = consents.filter((item) => item.consentType === 'RANKING_VISIBILITY')

  return (
    <div className="animate-fade-in-up space-y-5">
      <BackLink href="/app/progress" label="Progresso" />

      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-synse-text">
          <Users className="size-6 text-synse-primary" aria-hidden />
          Amigos
        </h1>
        <p className="text-sm text-synse-muted">
          Adicione pelo Synse ID e comparem os treinos. Ninguém aparece sem autorizar.
        </p>
      </header>

      {indisponivel ? (
        <p className="rounded-2xl border border-dashed border-synse-border p-5 text-center text-sm text-synse-muted">
          Recurso ainda não disponível. Tente de novo em alguns minutos.
        </p>
      ) : (
        <>
          <FriendsPanel
            meuSynseId={session.synseId}
            amigos={amigos}
            ranking={ranking}
            dias={DIAS_DO_RANKING}
          />

          {/*
            O controle da própria autorização, aqui e não só em Perfil: quem
            abriu esta tela é exatamente quem precisa decidir se quer aparecer.
          */}
          {rankingDaPrivacidade.length > 0 && (
            <ConsentList consents={rankingDaPrivacidade} />
          )}
        </>
      )}
    </div>
  )
}
