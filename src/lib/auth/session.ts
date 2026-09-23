import 'server-only'

import { cache } from 'react'

import { cookies } from 'next/headers'

import { getDataSource } from '@/lib/database'
import { isDemoMode } from '@/lib/database/env'
import { createSupabaseServerClient } from '@/lib/database/supabase-server'
import { DEMO_ORG_ID, getDemoDataset } from '@/lib/database/demo-seed'
import { logger } from '@/lib/logger'
import { isSoloOrganization, SOLO_ORGANIZATION_LABEL } from '@/lib/organizations/solo'
import type { UserTier } from '@/lib/plans/tiers'
import { lerAssinatura, SEM_ASSINATURA, type PlusSubscription } from '@/lib/plans/subscription'
import { PLUS_PRICE } from '@/lib/plans/tiers'
import type { UserRole } from '@/types/domain'

export const DEMO_SESSION_COOKIE = 'synse_demo_session'

/**
 * O contexto escolhido por uma conta de plataforma.
 *
 * `pessoal` ou o id de uma academia. O cookie diz o que a pessoa **pediu**; é
 * o banco que diz se ela pode — `is_super_admin()` é consultado a cada
 * requisição, e um cookie forjado por quem não tem o papel é simplesmente
 * ignorado.
 */
export const PLATFORM_CONTEXT_COOKIE = 'synse_contexto'
export const CONTEXTO_PESSOAL = 'pessoal'

/** A organização reservada que hospeda as contas de plataforma (0034). */
export const SYNSE_PLATFORM_ORG_ID = '00000000-0000-0000-0000-000000000002'

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
  /**
   * A assinatura por trás do `tier`.
   *
   * O `tier` diz o que vale agora; isto diz **até quando** e em que estado —
   * teste grátis, ativa, cancelada esperando o fim do período pago. É o que
   * permite a tela dizer "faltam 12 dias" em vez de só "você é Synse+".
   */
  plus: PlusSubscription
  /** Assinatura que libera abrir o próprio espaço como profissional. */
  professionalPlan: boolean
  isDemo: boolean
  /**
   * A conta é de plataforma. Diferente de `role`, que diz como ela está agindo
   * agora: um super admin em contexto pessoal tem `role: 'STUDENT'` e este
   * campo verdadeiro — é ele que faz o seletor de contexto aparecer.
   */
  isPlatformAccount: boolean
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
      description: 'Experiência do aluno — no teste grátis do Synse+',
      role: 'STUDENT',
      userProfileId: 'prof_0001',
      studentId: demo.studentIdForApp,
    },
    /*
     * A mesma tela, sem assinatura.
     *
     * Existe porque a persona acima entra em teste grátis, e com ela sozinha a
     * demonstração deixou de mostrar a **oferta** — "primeiro mês R$ 0,00,
     * depois o valor cheio" —, que é o que um aluno de verdade vê primeiro.
     * Uma tela invisível tinha sido trocada por outra.
     */
    {
      key: 'student-free',
      label: 'Aluno no plano grátis',
      description: 'Experiência do aluno — sem Synse+, vendo a oferta',
      role: 'STUDENT',
      userProfileId: 'prof_0002',
      studentId: demo.students[1]?.id ?? demo.studentIdForApp,
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

/**
 * O teste grátis da demonstração.
 *
 * A persona de aluno entra **no meio** do primeiro ciclo, não no começo nem no
 * fim: é o estado em que a tela tem mais o que dizer — o Synse+ liberado, e um
 * aviso de quando a primeira cobrança acontece. Começar no dia 1 esconderia a
 * contagem; terminar no dia 30 mostraria a tela de expiração, que não é o que
 * quem está avaliando o produto precisa ver.
 *
 * Isto é um estado, não uma chave fixa: passa pelo mesmo `PlusSubscription`
 * que a conta real usa, então a demonstração exercita o caminho de verdade. A
 * alternativa — um `tier: 'PRO'` cravado — seria a quarta vez nesta sessão em
 * que a vitrine mostra algo que o produto não faz assim.
 */
const DIAS_JA_CORRIDOS_NA_DEMO = 12

function assinaturaDaDemo(persona: DemoPersona, agora: Date): PlusSubscription {
  // Só a persona do teste. A do plano grátis existe justamente para mostrar a
  // tela de quem ainda não assinou.
  if (persona.key !== 'student') return SEM_ASSINATURA

  const fim = new Date(agora)
  fim.setDate(fim.getDate() + (PLUS_PRICE.trialDays - DIAS_JA_CORRIDOS_NA_DEMO))
  return { status: 'TRIAL', until: fim.toISOString() }
}

function demoSessionFor(persona: DemoPersona): SessionContext {
  const demo = getDemoDataset()
  const profile = demo.userProfiles.find((item) => item.id === persona.userProfileId)
  const student =
    persona.role === 'STUDENT'
      ? (demo.students.find((item) => item.userProfileId === persona.userProfileId) ??
        demo.students[0])
      : null
  const assinatura = assinaturaDaDemo(persona, new Date())

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
    tier: assinatura.status === 'TRIAL' ? 'PRO' : 'FREE',
    plus: assinatura,
    professionalPlan: false,
    isDemo: true,
    isPlatformAccount: false,
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

type ProfileRow = {
  id: string
  synse_id: string
  name: string
  email: string
  avatar_url: string | null
  tier?: string | null
  professional_plan?: boolean | null
  /* A 0036 pode não ter subido ainda — vide `readProfile`, que pede `*`. */
  plus_status?: string | null
  plus_until?: string | null
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
type ProfileRead =
  | { row: ProfileRow | null; error: null }
  | { row: null; error: { step: string; code: string | null; message: string } }

/**
 * A ficha de quem está autenticado, com `*`.
 *
 * Listar as colunas parecia mais cuidadoso e era o contrário: pedir uma coluna
 * que o banco ainda não tem derruba a consulta inteira, não só o campo novo.
 * Foi assim que `tier` — criada na 0014, aplicada à mão depois do deploy —
 * apagou a sessão de todo mundo entre publicar e migrar, e mandou quem tinha
 * academia para a tela de "você é academia ou pessoa física?".
 *
 * Com `*`, coluna nova nunca mais quebra sessão: vem quando existe, falta
 * quando não existe, e o código trata a ausência. O custo é trazer alguns
 * campos a mais de uma linha só, uma vez por requisição — barato perto de um
 * login que para de funcionar a cada migration.
 *
 * O erro continua sendo lido e registrado. Descartá-lo era o que fazia
 * problema de schema chegar disfarçado de "conta sem ficha".
 */
async function readProfile(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
  authUserId: string,
): Promise<ProfileRead> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('auth_user_id', authUserId)
    .maybeSingle()

  if (error) {
    logger.error('session:profile_read_failed', { code: error.code, error: error.message })
    return {
      row: null,
      error: { step: 'profile', code: error.code ?? null, message: error.message },
    }
  }

  return { row: data as ProfileRow | null, error: null }
}

// ── Resolução da sessão ─────────────────────────────────────────────────────
/**
 * Por que não há sessão?
 *
 * `null` respondia três perguntas diferentes com a mesma palavra: visitante
 * anônimo, conta sem academia, e falha ao ler a conta. As duas primeiras têm
 * destino certo — login e cadastro. A terceira não tinha destino nenhum, e
 * caía no cadastro junto com a segunda: quem já tem academia há meses era
 * recebido com "você é academia, profissional ou aluno?".
 *
 * Perguntar isso a quem já respondeu é pior que mostrar um erro. O erro a
 * pessoa reporta; a pergunta ela responde — e aí passa a existir uma segunda
 * academia, vazia, no lugar da que ela já tinha.
 */
export type SessionResolution =
  | { status: 'ok'; session: SessionContext }
  | { status: 'anonymous' }
  | { status: 'no-account' }
  | { status: 'unavailable'; step: string; code: string | null }

/**
 * Resolve a sessão, uma vez por requisição.
 *
 * Sem o `cache`, toda navegação pagava isto **duas vezes** — o layout do app
 * chama e a página chama de novo —, e cada vez são três idas à rede: validar o
 * token no Supabase, ler o perfil e ler o vínculo com a academia. Seis
 * viagens antes de a tela começar a buscar o que ela precisa mostrar.
 *
 * `cache` do React deduplica dentro de uma renderização e nada além dela: a
 * requisição seguinte resolve de novo, então continua valendo a mesma
 * validação no servidor. Não é cache entre usuários nem entre requisições.
 */
/** O contexto pedido no cookie. Nulo quando não há escolha guardada. */
async function contextoEscolhido(): Promise<string | null> {
  const cookieStore = await cookies()
  const valor = cookieStore.get(PLATFORM_CONTEXT_COOKIE)?.value?.trim()
  return valor ? valor : null
}

export const resolveSession = cache(resolverSessao)

async function resolverSessao(): Promise<SessionResolution> {
  if (isDemoMode()) {
    const cookieStore = await cookies()
    const persona = findDemoPersona(cookieStore.get(DEMO_SESSION_COOKIE)?.value)
    return persona ? { status: 'ok', session: demoSessionFor(persona) } : { status: 'anonymous' }
  }

  const supabase = await createSupabaseServerClient()
  if (!supabase) return { status: 'unavailable', step: 'client', code: null }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { status: 'anonymous' }

  const perfil = await readProfile(supabase, user.id)
  if (perfil.error) {
    return { status: 'unavailable', step: perfil.error.step, code: perfil.error.code }
  }

  const profile = perfil.row
  // Autenticado sem ficha é conta recém-criada: o cadastro é o destino certo.
  if (!profile) return { status: 'no-account' }

  /*
   * A conta é de plataforma?
   *
   * A pergunta vai ao banco, e não ao cookie. O cookie diz o que a pessoa
   * pediu; quem decide se ela pode é a linha em `organization_members` — e um
   * cookie forjado por quem não tem o papel não encontra nada aqui.
   */
  const { data: papelPlataforma } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_profile_id', profile.id)
    .eq('role', 'SUPER_ADMIN')
    .eq('status', 'ACTIVE')
    .limit(1)
    .maybeSingle()

  const plataforma = papelPlataforma != null

  if (plataforma) {
    const escolhido = await contextoEscolhido()

    /*
     * Agir como uma academia. A RLS já libera: `is_org_staff` chama
     * `is_super_admin` desde a 0004. O que muda aqui é só qual academia a tela
     * mostra — e o papel, que vira SUPER_ADMIN para as permissões abrirem.
     */
    if (escolhido && escolhido !== CONTEXTO_PESSOAL) {
      const { data: alvo } = await supabase
        .from('organizations')
        .select('id, name')
        .eq('id', escolhido)
        .maybeSingle()

      if (alvo) {
        const { data: matricula } = await supabase
          .from('students')
          .select('id')
          .eq('user_profile_id', profile.id)
          .eq('organization_id', alvo.id)
          .maybeSingle()

        return {
          status: 'ok',
          session: {
            userProfileId: profile.id,
            synseId: profile.synse_id,
            name: profile.name,
            email: profile.email,
            avatarUrl: profile.avatar_url,
            role: 'SUPER_ADMIN' as UserRole,
            organizationId: alvo.id,
            organizationName: alvo.name ?? 'Organização',
            studentId: matricula?.id ?? null,
            isSoloStudent: false,
            tier: (profile.tier ?? 'FREE') as UserTier,
            plus: lerAssinatura(profile),
            professionalPlan: profile.professional_plan === true,
            isDemo: false,
            isPlatformAccount: true,
          },
        }
      }
      /*
       * Academia escolhida que não existe mais — apagada enquanto o cookie
       * ficou guardado. Cair para o fluxo normal é melhor que erro: a pessoa
       * volta ao contexto pessoal e escolhe de novo.
       */
    }

    /*
     * Contexto pessoal.
     *
     * Vai direto à matrícula, sem passar pelo fluxo comum. Cair no fluxo comum
     * era o defeito: ele procura vínculo de **equipe** primeiro, então quem
     * também é dono de uma academia pedia "conta pessoal" e aterrissava no
     * painel dela como OWNER. O botão parecia não funcionar.
     */
    if (escolhido === CONTEXTO_PESSOAL) {
      const { data: matriculas } = await supabase
        .from('students')
        .select('id,organization_id,organizations(name)')
        .eq('user_profile_id', profile.id)
        .order('enrolled_at', { ascending: false })
        .limit(5)

      const lista = matriculas ?? []
      const matricula = lista.find((row) => !isSoloOrganization(row.organization_id)) ?? lista[0]

      if (matricula) {
        const gym = matricula.organizations as { name?: string } | null
        const solo = isSoloOrganization(matricula.organization_id)

        return {
          status: 'ok',
          session: {
            userProfileId: profile.id,
            synseId: profile.synse_id,
            name: profile.name,
            email: profile.email,
            avatarUrl: profile.avatar_url,
            role: 'STUDENT' as UserRole,
            organizationId: matricula.organization_id,
            organizationName: solo ? SOLO_ORGANIZATION_LABEL : (gym?.name ?? 'Minha academia'),
            studentId: matricula.id,
            isSoloStudent: solo,
            tier: (profile.tier ?? 'FREE') as UserTier,
            plus: lerAssinatura(profile),
            professionalPlan: profile.professional_plan === true,
            isDemo: false,
            isPlatformAccount: true,
          },
        }
      }

      /*
       * Conta de plataforma que nunca foi aluna de nada. Seguir para o fluxo
       * comum a devolve ao painel, que é o único lugar que faz sentido —
       * melhor que despejá-la no cadastro como se não tivesse conta.
       */
    }
  }

  const vinculo = await supabase
    .from('organization_members')
    .select('organization_id, role, organizations ( name )')
    .eq('user_profile_id', profile.id)
    .eq('status', 'ACTIVE')
    /*
     * A organização da plataforma fica de fora. Ela existe só para hospedar o
     * papel; tratá-la como a academia da pessoa abriria o painel numa
     * organização sem alunos, sem cobranças e sem sentido.
     */
    .neq('organization_id', SYNSE_PLATFORM_ORG_ID)
    .limit(1)
    .maybeSingle()

  if (vinculo.error) {
    logger.error('session:membership_read_failed', {
      code: vinculo.error.code,
      error: vinculo.error.message,
    })
    return { status: 'unavailable', step: 'membership', code: vinculo.error.code ?? null }
  }

  const membership = vinculo.data

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
    const matriculas = await supabase
      .from('students')
      .select('id,organization_id,status,organizations(name)')
      .eq('user_profile_id', profile.id)
      .order('enrolled_at', { ascending: false })
      .limit(5)

    if (matriculas.error) {
      logger.error('session:enrolment_read_failed', {
        code: matriculas.error.code,
        error: matriculas.error.message,
      })
      return { status: 'unavailable', step: 'enrolment', code: matriculas.error.code ?? null }
    }

    /*
     * Academia de verdade ganha da organização reservada.
     *
     * Quem entrou sozinho e depois recebeu o código da academia tem duas
     * matrículas, criadas possivelmente no mesmo dia — ordenar por data
     * decidiria no empate, e no dia seguinte poderia decidir diferente. Aqui a
     * regra é explícita: existindo academia, é nela que a pessoa está.
     */
    const enrolments = matriculas.data ?? []
    const enrolment =
      enrolments.find((row) => !isSoloOrganization(row.organization_id)) ?? enrolments[0]

    if (!enrolment) return { status: 'no-account' }

    const gym = enrolment.organizations as { name?: string } | null
    const solo = isSoloOrganization(enrolment.organization_id)

    return {
      status: 'ok',
      session: {
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
        plus: lerAssinatura(profile),
        professionalPlan: profile.professional_plan === true,
        isDemo: false,
        isPlatformAccount: plataforma,
      },
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
    status: 'ok',
    session: {
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
      plus: lerAssinatura(profile),
      professionalPlan: profile.professional_plan === true,
      isDemo: false,
      isPlatformAccount: plataforma,
    },
  }
}

/** A sessão, ou nada. Para quem só precisa saber se há alguém logado. */
export async function getSession(): Promise<SessionContext | null> {
  const resolucao = await resolveSession()
  return resolucao.status === 'ok' ? resolucao.session : null
}

/** Organização ativa com os dados completos. */
export async function getActiveOrganization(session: SessionContext) {
  const dataSource = await getDataSource()
  return dataSource.getOrganization(session.organizationId)
}

export function demoMemberCount() {
  return getDemoDataset().organizationMembers.length
}
