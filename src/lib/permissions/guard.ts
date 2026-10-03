import 'server-only'

import { forbidden, unauthorized } from '@/lib/errors'
import { can, type Permission } from '@/lib/permissions/permissions'
import type { SessionContext } from '@/lib/auth/session'

/**
 * Barreira única de autorização no servidor.
 * Toda server action / route handler que toca em dados de uma organização
 * deve passar por aqui — nunca confiar em checagem feita no cliente.
 */
export function requirePermission(session: SessionContext | null, permission: Permission) {
  if (!session) throw unauthorized()
  if (!can(session.role, permission)) throw forbidden(permission)
  return session
}

/**
 * Garante que o recurso pertence à organização ativa da sessão.
 * É a segunda linha de defesa do multi-tenancy (a primeira é a RLS).
 */
export function assertSameOrganization(session: SessionContext, organizationId: string) {
  if (session.role === 'SUPER_ADMIN') return
  if (session.organizationId !== organizationId) {
    throw forbidden('organization:mismatch')
  }
}
