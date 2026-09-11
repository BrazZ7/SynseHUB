import 'server-only'

import { cookies } from 'next/headers'

import { getDataSource } from '@/lib/database'
import { isDemoMode } from '@/lib/database/env'
import { createSupabaseServerClient } from '@/lib/database/supabase-server'
import { DEMO_ORG_ID, getDemoDataset } from '@/lib/database/demo-seed'
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

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id, synse_id, name, email, avatar_url')
    .eq('auth_user_id', user.id)
    .maybeSingle()

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
    const { data: enrolment } = await supabase
      .from('students')
      .select('id,organization_id,organizations(name)')
      .eq('user_profile_id', profile.id)
      .order('enrolled_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!enrolment) return null

    const gym = enrolment.organizations as { name?: string } | null

    return {
      userProfileId: profile.id,
      synseId: profile.synse_id,
      name: profile.name,
      email: profile.email,
      avatarUrl: profile.avatar_url,
      role: 'STUDENT' as UserRole,
      organizationId: enrolment.organization_id,
      organizationName: gym?.name ?? 'Minha academia',
      studentId: enrolment.id,
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
