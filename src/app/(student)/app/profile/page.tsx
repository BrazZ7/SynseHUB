import type { Metadata } from 'next'
import { BarChart3, Flame, LogOut, Star, Trophy, UserRound, Zap } from 'lucide-react'

import { ThemeToggle } from '@/components/synse/theme-toggle'
import { Button } from '@/components/ui/button'
import { AvatarPicker } from '@/features/account/avatar-picker'
import { LinkGymCard } from '@/features/account/link-gym-card'
import { ProfessionalCard } from '@/features/account/professional-card'
import { CloseAccountCard } from '@/features/account/close-account-card'
import { MedalShelf } from '@/features/challenges/medal-shelf'
import { ConsentList } from '@/features/consents/consent-list'
import {
  ConquistaHex,
  ICONES_DO_TOPO,
  NivelCard,
  RecordeRow,
  SemanaChart,
  StatTile,
} from '@/features/students/components/profile-pieces'
import { getPerfilCompleto } from '@/features/students/profile-service'
import { signOut } from '@/lib/auth/actions'
import { requireStudentSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { isPendingMigration } from '@/lib/database/pending-migration'

export const metadata: Metadata = { title: 'Perfil' }

export default async function StudentProfilePage() {
  const session = await requireStudentSession()
  const dataSource = await getDataSource()

  const [student, organization, consents] = await Promise.all([
    dataSource.getStudent(session.organizationId, session.studentId),
    dataSource.getOrganization(session.organizationId),
    /*
     * A lista de consentimentos depende da 0017. Enquanto ela não estiver
     * aplicada, a tela mostra o resto do perfil em vez de quebrar inteira —
     * publicar e migrar são dois atos separados neste projeto.
     */
    dataSource.listConsents(session.userProfileId).catch(() => []),
  ])

  const perfil = await getPerfilCompleto(
    session,
    organization?.timezone ?? 'America/Sao_Paulo',
  )

  let fotoAssinada: string | null = null
  try {
    fotoAssinada = await dataSource.getAvatarUrl(student?.avatarUrl ?? null)
  } catch (erro) {
    if (!isPendingMigration(erro)) throw erro
  }

  const km = (valor: number) => `${valor.toFixed(1).replace('.', ',')} km`

  return (
    <div className="animate-fade-in-up space-y-5">
      {/* ── Identidade ───────────────────────────────────────────────────── */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-synse-text">Perfil</h1>
          <p className="text-sm text-synse-muted">Constância hoje, resultados amanhã.</p>
        </div>
        <ThemeToggle />
      </header>

      <section className="space-y-4 rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm">
        <AvatarPicker nome={session.name} fotoAtual={fotoAssinada} />

        <div className="min-w-0 border-t border-synse-border pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-lg font-semibold text-synse-text">{session.name}</p>
            <span className="inline-flex items-center gap-1 rounded-full border border-synse-primary/40 bg-synse-primary/10 px-2.5 py-0.5 text-xs font-medium text-synse-primary">
              Nível {perfil.nivel.nivel}
            </span>
            {perfil.sequencia.hoje && (
              <span className="inline-flex items-center gap-1 text-xs text-synse-muted">
                <span className="size-1.5 rounded-full bg-synse-success" aria-hidden />
                Ativo hoje
              </span>
            )}
          </div>
          <p className="truncate text-sm text-synse-muted">{session.email}</p>
          <p className="mt-1 font-mono text-xs tracking-wide text-synse-muted">{session.synseId}</p>
        </div>
      </section>

      {/* ── Os quatro números ────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-3">
        <StatTile
          icone={ICONES_DO_TOPO.Dumbbell}
          valor={String(perfil.totais.treinos)}
          rotulo="Treinos"
        />
        <StatTile
          icone={ICONES_DO_TOPO.Footprints}
          valor={km(perfil.totais.quilometros)}
          rotulo="Corrida"
        />
        <StatTile
          icone={ICONES_DO_TOPO.Trophy}
          valor={String(perfil.totais.desafios)}
          rotulo="Desafios"
        />
        <StatTile
          icone={ICONES_DO_TOPO.Medal}
          valor={String(perfil.totais.medalhas)}
          rotulo="Medalhas"
        />
      </section>

      <NivelCard nivel={perfil.nivel} />

      {/* ── Três marcadores ──────────────────────────────────────────────── */}
      <section className="grid grid-cols-3 gap-3">
        <Marcador
          icone={<Flame className="size-5 text-synse-primary" aria-hidden />}
          valor={String(perfil.sequencia.dias)}
          rotulo={perfil.sequencia.dias === 1 ? 'dia de sequência' : 'dias de sequência'}
        />
        <Marcador
          icone={<Trophy className="size-5 text-synse-primary" aria-hidden />}
          valor={String(perfil.totais.medalhas)}
          rotulo={perfil.totais.medalhas === 1 ? 'medalha' : 'medalhas'}
        />
        <Marcador
          icone={<Zap className="size-5 text-synse-primary" aria-hidden />}
          valor={String(perfil.totais.desafios)}
          rotulo="desafios concluídos"
        />
      </section>

      {/* ── Conquistas ───────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-synse-border bg-synse-surface p-5">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-synse-text">
          <Star className="size-4 text-synse-primary" aria-hidden />
          Suas conquistas
        </h2>
        {/* Rola no celular: seis hexágonos não cabem em 360px sem encolher
            até virarem ilegíveis. */}
        <ul className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
          {perfil.conquistas.map((conquista) => (
            <ConquistaHex key={conquista.code} conquista={conquista} />
          ))}
        </ul>
      </section>

      {/* ── Evolução ─────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-synse-border bg-synse-surface p-5">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-synse-text">
            <BarChart3 className="size-4 text-synse-primary" aria-hidden />
            Sua evolução
          </h2>
          <span className="text-xs text-synse-muted">Últimas 4 semanas</span>
        </div>

        <SemanaChart dias={perfil.semana} />

        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-synse-border pt-4">
          <Numero rotulo="treinos" valor={String(perfil.ultimas4Semanas.treinos)} />
          <Numero rotulo="distância" valor={km(perfil.ultimas4Semanas.quilometros)} />
          <Numero
            rotulo="de atividade"
            valor={`${Math.floor(perfil.ultimas4Semanas.minutos / 60)}h ${perfil.ultimas4Semanas.minutos % 60}min`}
          />
          <Numero
            rotulo="consistência"
            valor={
              perfil.ultimas4Semanas.consistencia === null
                ? '—'
                : `${perfil.ultimas4Semanas.consistencia > 0 ? '+' : ''}${perfil.ultimas4Semanas.consistencia}%`
            }
          />
        </dl>
      </section>

      {/* ── Recordes ─────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-synse-border bg-synse-surface p-5">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-synse-text">
          <Star className="size-4 text-synse-primary" aria-hidden />
          Recordes pessoais
        </h2>
        <ul className="space-y-2">
          {perfil.recordes.map((recorde) => (
            <RecordeRow key={recorde.rotulo} recorde={recorde} />
          ))}
        </ul>
      </section>

      <MedalShelf medals={perfil.medalhas} />

      <section className="rounded-2xl border border-synse-border bg-gradient-to-br from-synse-surface to-synse-surface-2 p-5">
        <p className="text-lg font-medium italic leading-snug text-synse-text">
          Disciplina hoje,
          <br />
          liberdade sempre.
        </p>
        <p className="mt-3 text-[11px] uppercase tracking-[0.2em] text-synse-muted">
          Synse · mais que resultados
        </p>
      </section>

      {/*
        ── A conta ────────────────────────────────────────────────────────
        Cabeçalho das seções abaixo, e não um link: tudo o que ele resume —
        academia, plano, privacidade, encerrar conta — está nesta mesma
        página. Uma seta aqui prometeria uma tela que não existe.
      */}
      <section className="flex items-center gap-3 rounded-2xl border border-synse-border bg-synse-surface p-5">
        <UserRound className="size-5 shrink-0 text-synse-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-synse-text">Minha conta Synse</p>
          <p className="truncate text-xs text-synse-muted">
            {session.isSoloStudent ? 'Sem vínculo' : (organization?.name ?? 'Academia')} ·{' '}
            {student?.planName ?? 'Sem plano'} · {student?.trainerName ?? 'Professor a definir'}
          </p>
        </div>
      </section>

      {session.isSoloStudent && <LinkGymCard />}
      <ProfessionalCard ativo={session.professionalPlan} defaultName={session.name} />
      <ConsentList consents={consents} />
      <CloseAccountCard />

      <form action={signOut}>
        <Button type="submit" variant="outline" className="w-full">
          <LogOut className="size-4" />
          Sair
        </Button>
      </form>
    </div>
  )
}

function Marcador({
  icone,
  valor,
  rotulo,
}: {
  icone: React.ReactNode
  valor: string
  rotulo: string
}) {
  return (
    <div className="rounded-2xl border border-synse-border bg-synse-surface p-4 text-center">
      <span className="grid place-items-center">{icone}</span>
      <p className="mt-2 text-lg font-semibold tabular-nums text-synse-text">{valor}</p>
      <p className="text-[11px] leading-tight text-synse-muted">{rotulo}</p>
    </div>
  )
}

function Numero({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="sr-only">{rotulo}</dt>
      <dd className="text-base font-semibold tabular-nums text-synse-text">{valor}</dd>
      <p aria-hidden className="text-xs text-synse-muted">
        {rotulo}
      </p>
    </div>
  )
}
