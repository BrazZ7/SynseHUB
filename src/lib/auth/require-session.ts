import 'server-only'

import { redirect } from 'next/navigation'

import { getAuthenticatedUserId, resolveSession, type SessionContext } from '@/lib/auth/session'
import { can, isHubRole, type Permission } from '@/lib/permissions/permissions'

/**
 * Portões de entrada das rotas.
 *
 * Cada layout protegido chama um destes. Não existe rota autenticada que
 * dependa apenas de checagem no cliente.
 */

export async function requireSession(): Promise<SessionContext> {
  const resolucao = await resolveSession()

  switch (resolucao.status) {
    case 'ok':
      return resolucao.session

    /*
     * Autenticado sem academia é estado legítimo: a conta existe, falta o
     * cadastro. Mandar essa pessoa para o login a devolveria a uma tela onde
     * ela já está logada, sem saída.
     */
    case 'no-account':
      redirect('/onboarding')

    /*
     * Falha ao ler a conta não é conta inexistente.
     *
     * Tratar as duas igual mandava para o cadastro quem já tem academia há
     * meses — e "você é academia, profissional ou aluno?" é uma pergunta que a
     * pessoa responde, criando uma segunda academia vazia no lugar da dela.
     */
    case 'unavailable':
      redirect('/login?erro=indisponivel')

    default:
      redirect('/login')
  }
}

/**
 * Portão do cadastro de academia.
 *
 * Não usa `requireSession` de propósito: aqui a ausência de organização é
 * pré-condição, não erro. Devolve para o painel quem já tem academia.
 */
export async function requireOnboarding(): Promise<string> {
  const resolucao = await resolveSession()

  // Mesma distinção do `requireSession`, e aqui ela é o ponto: esta é a tela
  // que não pode aparecer para quem já escolheu.
  if (resolucao.status === 'unavailable') redirect('/login?erro=indisponivel')
  if (resolucao.status === 'anonymous') redirect('/login')
  if (resolucao.status === 'ok') {
    redirect(resolucao.session.role === 'STUDENT' ? '/app' : '/dashboard')
  }

  const authUserId = await getAuthenticatedUserId()
  if (!authUserId) redirect('/login')
  return authUserId
}

/** Painel administrativo: nega aluno, mesmo autenticado. */
export async function requireHubSession(permission?: Permission): Promise<SessionContext> {
  const session = await requireSession()
  if (!isHubRole(session.role)) redirect('/app')
  if (permission && !can(session.role, permission)) redirect('/dashboard?erro=sem-permissao')
  return session
}

/** Synse App: exige vínculo de aluno. */
export async function requireStudentSession(): Promise<SessionContext & { studentId: string }> {
  const session = await requireSession()
  if (!session.studentId) redirect('/dashboard')
  return session as SessionContext & { studentId: string }
}

export async function requirePlatformSession(): Promise<SessionContext> {
  const session = await requireSession()
  if (session.role !== 'SUPER_ADMIN') redirect('/dashboard?erro=sem-permissao')
  return session
}
