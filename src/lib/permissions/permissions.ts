import type { UserRole } from '@/types/domain'

/**
 * RBAC do Synse.
 *
 * Regra inegociável: o front-end usa estas funções apenas para *esconder* UI.
 * Toda leitura/escrita passa por `requirePermission` no servidor antes de
 * tocar em dados — e o Postgres ainda aplica Row Level Security por cima.
 */

export const PERMISSIONS = [
  'dashboard:view',

  'students:read',
  'students:write',
  'students:delete',

  'staff:read',
  'staff:write',

  'plans:read',
  'plans:write',

  'finance:read',
  'finance:write',
  'finance:refund',

  'checkin:read',
  'checkin:write',

  'workouts:read',
  'workouts:write',

  'assessments:read',
  'assessments:write',

  'nutrition:read',
  'nutrition:write',

  'content:read',
  'content:write',

  'challenges:read',
  'challenges:write',

  'crm:read',
  'crm:write',

  'reports:read',
  'schedule:read',
  'notifications:read',

  'settings:read',
  'settings:write',

  'platform:read',
  'platform:write',
] as const

export type Permission = (typeof PERMISSIONS)[number]

const OWNER_PERMISSIONS: Permission[] = PERMISSIONS.filter(
  (p) => !p.startsWith('platform:'),
) as Permission[]

const MANAGER_PERMISSIONS: Permission[] = OWNER_PERMISSIONS.filter(
  (p) => p !== 'settings:write' && p !== 'students:delete' && p !== 'finance:refund',
)

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  SUPER_ADMIN: [...PERMISSIONS],
  OWNER: OWNER_PERMISSIONS,
  MANAGER: MANAGER_PERMISSIONS,
  RECEPTIONIST: [
    'dashboard:view',
    'students:read',
    'students:write',
    'plans:read',
    'finance:read',
    'finance:write',
    'checkin:read',
    'checkin:write',
    'schedule:read',
    'crm:read',
    'crm:write',
    'notifications:read',
  ],
  TRAINER: [
    'dashboard:view',
    'students:read',
    'checkin:read',
    'workouts:read',
    'workouts:write',
    'assessments:read',
    'assessments:write',
    'schedule:read',
    'content:read',
    'notifications:read',
  ],
  NUTRITIONIST: [
    'dashboard:view',
    'students:read',
    'assessments:read',
    'nutrition:read',
    'nutrition:write',
    'content:read',
    'schedule:read',
    'notifications:read',
  ],
  PROFESSIONAL: [
    'dashboard:view',
    'students:read',
    'workouts:read',
    'workouts:write',
    'assessments:read',
    'schedule:read',
    'content:read',
    'notifications:read',
  ],
  STUDENT: [],
}

/** Papéis que operam o painel administrativo (SynseHub). */
export const HUB_ROLES: UserRole[] = [
  'SUPER_ADMIN',
  'OWNER',
  'MANAGER',
  'RECEPTIONIST',
  'TRAINER',
  'NUTRITIONIST',
  'PROFESSIONAL',
]

export function permissionsForRole(role: UserRole): Permission[] {
  return ROLE_PERMISSIONS[role] ?? []
}

export function can(role: UserRole, permission: Permission): boolean {
  return permissionsForRole(role).includes(permission)
}

export function canAny(role: UserRole, permissions: Permission[]): boolean {
  return permissions.some((permission) => can(role, permission))
}

export function isHubRole(role: UserRole): boolean {
  return HUB_ROLES.includes(role)
}

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: 'Synse Admin',
  OWNER: 'Proprietário',
  MANAGER: 'Gerente',
  RECEPTIONIST: 'Recepção',
  TRAINER: 'Professor',
  NUTRITIONIST: 'Nutricionista',
  PROFESSIONAL: 'Profissional',
  STUDENT: 'Aluno',
}
