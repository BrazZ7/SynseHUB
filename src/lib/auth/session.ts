import 'server-only'

import { cookies } from 'next/headers'

import { getDataSource } from '@/lib/database'
import { isDemoMode } from '@/lib/database/env'
import { createSupabaseServerClient } from '@/lib/database/supabase-server'
import { DEMO_ORG_ID, getDemoDataset } from '@/lib/database/demo-seed'
import { isPendingMigration } from '@/lib/database/pending-migration'
import { logger } from '@/lib/logger'
import { isSoloOrganization, SOLO_ORGANIZATION_LABEL } from '@/lib/organizations/solo'
import type { UserTier } from '@/lib/plans/tiers'
import type { UserRole } from '@/types/domain'

export const DEMO_SESSION_COOKIE = 'synse_demo_session'

export type SessionContext = {
  userProfileId: string
  synseId: string
  name: string
  email: string
  avatarUrl: string | null
  role: UserRole
  organizationId: string
  organizationName: string
  /** Preenchido quando o usuário é aluno de alguma academia. */
  studentId: string | null
  /** Aluno sem academia vinculada: a matrícula está na organização reservada. */
  isSoloStudent: boolean
  /** Plano da conta da pessoa (Synse ou Synse+), não o plano da academia. */
  tier: UserTier
  isDemo: boolean
}

// ── Personas de demonstração ────────────────────────────────────────────────
/**
 * Contas de demonstração.
 *
 * Não existe senha: em DEMO MODE a sessão é escolhida explicitamente e gravada
 * num cookie assinado pelo próprio host. Nenhuma credencial real é criada, e o
 * modo só é possível quando não há Supabase configurado.
 */
export type DemoPersona = {
  key: string
  label: string
  description: string
  role: UserRole
  userProfileId: string
  studentId?: string
}

export function getDemoPersonas(): DemoPersona[] {
  const demo = getDemoDataset()
  return [
    {
      key: 'owner',
      label: 'Emerson Braz',
      description: 'Proprietário — acesso completo à Academia Alpha',
      role: 'OWNER',
      userProfileId: 'prof_staff_0001',
    },
    {
      key: 'manager',
      label: 'Marina Duarte',
      description: 'Gerente — operação, alunos e financeiro',
      role: 'MANAGER',
      userProfileId: 'prof_staff_0002',
    },
    {
      key: 'trainer',
      label: 'Rafael Nunes',
      description: 'Professor — treinos, avaliações e alunos atribuídos',
      role: 'TRAINER',
      userProfileId: 'prof_staff_0003',
    },
    {
      key: 'receptionist',
      label: 'Lucas Ferraz',
      description: 'Recepção — check-in, matrículas e cobranças',
      role: 'RECEPTIONIST',
      userProfileId: 'prof_staff_0006',
    },
    {
      key: 'student',
      label: 'Aluno Synse App',
      description: 'Experiência do aluno no Synse App',
      role: 'STUDENT',
      userProfileId: 'prof_0001',
      studentId: demo.studentIdForApp,
    },
    {
      key: 'super-admin',
      label: 'Synse Plataforma',
      description: 'Super admin — visão de todas as organizações',
      role: 'SUPER_ADMIN',
      userProfileId: 'prof_super_0001',
    },
  ]
}

export function findDemoPersona(key: string | undefined | null): DemoPersona | null {
  if (!key) return null
  return getDemoPersonas().find((persona) => persona.key === key) ?? null
}

function demoSessionFor(persona: DemoPersona): SessionContext {
  const demo = getDemoDataset()
  const profile = demo.userProfiles.find((item) => item.id === persona.userProfileId)
  const student =
    persona.role === 'STUDENT'
      ? (demo.students.find((item) => item.userProfileId === persona.userProfileId) ??
        demo.students[0])
      : null

  return {
    userProfileId: persona.userProfileId,
    synseId: profile?.synseId ?? student?.synseId ?? 'SYN-DEMO0001',
    name: profile?.name ?? student?.name ?? persona.label,
    email: profile?.email ?? student?.email ?? 'demo@synse.com.br',
    avatarUrl: null,
    role: persona.role,
    organizationId: DEMO_ORG_ID,
    organizationName: demo.organization.name,
    studentId: student?.id ?? null,
    isSoloStudent: false,
    tier: 'FREE',
    isDemo: true,
  }
}

/**
 * Existe usuário autenticado, mesmo sem academia?
 *
 * `getSession` devolve null tanto para visitante anônimo quanto para quem
 * acabou de criar a conta e ainda não tem organização. Os dois casos exigem
 * destinos diferentes: um vai para o login, o outro para o cadastro da
 * academia. Sem essa distinção, quem se cadastra é mandado de volta para uma
 * tela de login onde já está logado.
 */
export async function getAuthenticatedUserId(): Promise<string | null> {
  if (isDemoMode()) return null

  const supabase = await createSupabaseServerClient()
  if (!supabase) return null

  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

const PROFILE_COLUMNS = 'id, synse_id, name, email, avatar_url'

type ProfileRow = {
  id: string
  synse_id: string
  name: string
  email: string
  avatar_url: string | null
  tier?: string | null
}

/**
 * A ficha de quem está autenticado.
 *
 * Duas tentativas de propósito. `tier` só existe depois da migration 0014, e
 * publicar não aplica migration: entre um e outro, pedir a coluna derruba a
 * consulta inteira — não só o campo novo. A sessão vira nula, quem acabou de
 * entrar é mandado para o cadastro, e da tela parece que o login não responde.
 * Foi exatamente o que aconteceu.
 *
 * O erro também passa a ser registrado. Antes ele era descartado junto com o
 * resultado, e um problema de schema chegava disfarçado de "conta sem ficha" —
 * o mesmo silêncio, num lugar em que ele custa caro.
 */
async function readProfile(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
  authUserId: string,
): Promise<ProfileRow | null> {
  const completa = await supabase
    .from('user_profiles')
    .select(`${PROFILE_COLUMNS}, tier`)
    .eq('auth_user_id', authUserId)
    .maybeSingle()

  if (!completa.error) return completa.data as ProfileRow | null

  if (!isPendingMigration(completa.error)) {
    logger.error('session:profile_read_failed', { error: String(completa.error.message) })
    return null
  }

  logger.warn('session:tier_column_missing', {
    detalhe: 'Migration 0014 pendente. Sessão segue no plano gratuito.',
  })

  const legado = await supabase
    .from('user_profiles')
    .select(PROFILE_COLUMNS)
    .eq('auth_user_id', authUserId)
    .maybeSingle()

  if (legado.error) {
    logger.error('session:profile_read_failed', { error: String(legado.error.message) })
    return null
  }

  return legado.data as ProfileRow | null
}

// ── Resolução da sessão ─────────────────────────────────────────────────────
export async function getSession(): Promise<SessionContext | null> {
  if (isDemoMode()) {
    const cookieStore = await cookies()
    const persona = findDemoPersona(cookieStore.get(DEMO_SESSION_COOKIE)?.value)
    return persona ? demoSessionFor(persona) : null
  }

  const supabase = await createSupabaseServerClient()
  if (!supabase) return null

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const profile = await readProfile(supabase, user.id)
  if (!profile) return null

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id, role, organizations ( name )')
    .eq('user_profile_id', profile.id)
    .eq('status', 'ACTIVE')
    .limit(1)
    .maybeSingle()

  /*
   * Sem vínculo de equipe, ainda pode haver matrícula.
   *
   * Ser aluno e ser equipe são coisas diferentes: a equipe vive em
   * `organization_members`, o aluno em `students`. Exigir a primeira para
   * montar qualquer sessão fazia o aluno ser tratado como quem não tem conta —
   * entrava, era devolvido para o onboarding, e da tela parecia que o botão não
   * funcionava.
   *
   * É o mesmo engano que impedia o aluno de ler o nome da própria academia na
   * RLS. Vale a pena repetir onde ele mora: em todo lugar que pergunta "essa
   * pessoa pertence à organização?" e responde olhando só para a equipe.
   */
  if (!membership) {
    const { data: enrolments } = await supabase
      .from('students')
      .select('id,organization_id,status,organizations(name)')
      .eq('user_profile_id', profile.id)
      .order('enrolled_at', { ascending: false })
      .limit(5)

    /*
     * Academia de verdade ganha da organização reservada.
     *
     * Quem entrou sozinho e depois recebeu o código da academia tem duas
     * matrículas, criadas possivelmente no mesmo dia — ordenar por data
     * decidiria no empate, e no dia seguinte poderia decidir diferente. Aqui a
     * regra é explícita: existindo academia, é nela que a pessoa está.
     */
    const enrolment =
      enrolments?.find((row) => !isSoloOrganization(row.organization_id)) ?? enrolments?.[0]

    if (!enrolment) return null

    const gym = enrolment.organizations as { name?: string } | null
    const solo = isSoloOrganization(enrolment.organization_id)

    return {
      userProfileId: profile.id,
      synseId: profile.synse_id,
      name: profile.name,
      email: profile.email,
      avatarUrl: profile.avatar_url,
      role: 'STUDENT' as UserRole,
      organizationId: enrolment.organization_id,
      organizationName: solo ? SOLO_ORGANIZATION_LABEL : (gym?.name ?? 'Minha academia'),
      studentId: enrolment.id,
      isSoloStudent: solo,
      tier: (profile.tier ?? 'FREE') as UserTier,
      isDemo: false,
    }
  }

  const { data: student } = await supabase
    .from('students')
    .select('id')
    .eq('user_profile_id', profile.id)
    .eq('organization_id', membership.organization_id)
    .maybeSingle()

  const organizations = membership.organizations as { name?: string } | null

  return {
    userProfileId: profile.id,
    synseId: profile.synse_id,
    name: profile.name,
    email: profile.email,
    avatarUrl: profile.avatar_url,
    role: membership.role as UserRole,
    organizationId: membership.organization_id,
    organizationName: organizations?.name ?? 'Minha organização',
    studentId: student?.id ?? null,
    isSoloStudent: false,
    tier: (profile.tier ?? 'FREE') as UserTier,
    isDemo: false,
  }
}

/** Organização ativa com os dados completos. */
export async function getActiveOrganization(session: SessionContext) {
  const dataSource = await getDataSource()
  return dataSource.getOrganization(session.organizationId)
}

export function demoMemberCount() {
  return getDemoDataset().organizationMembers.length
}
