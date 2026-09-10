import 'server-only'

import { redirect } from 'next/navigation'

import { getAuthenticatedUserId, getSession, type SessionContext } from '@/lib/auth/session'
import { can, isHubRole, type Permission } from '@/lib/permissions/permissions'

/**
 * Portões de entrada das rotas.
 *
 * Cada layout protegido chama um destes. Não existe rota autenticada que
 * dependa apenas de checagem no cliente.
 */

export async function requireSession(): Promise<SessionContext> {
  const session = await getSession()
  if (session) return session

  // Autenticado sem academia é estado legítimo: a conta existe, falta o
  // cadastro. Mandar essa pessoa para o login a devolveria a uma tela onde
  // ela já está logada, sem saída.
  if (await getAuthenticatedUserId()) redirect('/onboarding')
  redirect('/login')
}

/**
 * Portão do cadastro de academia.
 *
 * Não usa `requireSession` de propósito: aqui a ausência de organização é
 * pré-condição, não erro. Devolve para o painel quem já tem academia.
 */
export async function requireOnboarding(): Promise<string> {
  const authUserId = await getAuthenticatedUserId()
  if (!authUserId) redirect('/login')
  if (await getSession()) redirect('/dashboard')
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
