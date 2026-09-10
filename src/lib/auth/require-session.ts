import 'server-only'

import { redirect } from 'next/navigation'

import { getSession, type SessionContext } from '@/lib/auth/session'
import { can, isHubRole, type Permission } from '@/lib/permissions/permissions'

/**
 * Portões de entrada das rotas.
 *
 * Cada layout protegido chama um destes. Não existe rota autenticada que
 * dependa apenas de checagem no cliente.
 */

export async function requireSession(): Promise<SessionContext> {
  const session = await getSession()
  if (!session) redirect('/login')
  return session
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
