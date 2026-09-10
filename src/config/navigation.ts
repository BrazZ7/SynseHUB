import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  Apple,
  BadgeDollarSign,
  BarChart3,
  Bell,
  CalendarDays,
  ClipboardList,
  CreditCard,
  Dumbbell,
  Gauge,
  KanbanSquare,
  Library,
  QrCode,
  Settings,
  Sparkles,
  Trophy,
  UserRound,
  Users,
} from 'lucide-react'

import type { Permission } from '@/lib/permissions/permissions'

export type NavItem = {
  label: string
  href: string
  icon: LucideIcon
  /** Permissão mínima exigida. A navegação é filtrada no servidor. */
  permission: Permission
  /** Marca módulos ainda não liberados na Fase 1. */
  soon?: boolean
}

export type NavGroup = {
  label: string
  items: NavItem[]
}

export const HUB_NAVIGATION: NavGroup[] = [
  {
    label: 'Operação',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: Gauge, permission: 'dashboard:view' },
      { label: 'Alunos', href: '/students', icon: Users, permission: 'students:read' },
      { label: 'Check-in', href: '/checkin', icon: QrCode, permission: 'checkin:read' },
      { label: 'Agenda', href: '/schedule', icon: CalendarDays, permission: 'schedule:read', soon: true },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { label: 'Financeiro', href: '/finance', icon: BadgeDollarSign, permission: 'finance:read' },
      { label: 'Planos', href: '/plans', icon: ClipboardList, permission: 'plans:read' },
      { label: 'Synse Pay', href: '/synse-pay', icon: CreditCard, permission: 'finance:read' },
    ],
  },
  {
    label: 'Treino e saúde',
    items: [
      { label: 'Treinos', href: '/workouts', icon: Dumbbell, permission: 'workouts:read' },
      { label: 'Avaliações', href: '/assessments', icon: Activity, permission: 'assessments:read', soon: true },
      { label: 'Nutrição', href: '/nutrition', icon: Apple, permission: 'nutrition:read', soon: true },
      { label: 'Profissionais', href: '/staff', icon: UserRound, permission: 'staff:read' },
    ],
  },
  {
    label: 'Crescimento',
    items: [
      { label: 'Conteúdos', href: '/content', icon: Library, permission: 'content:read', soon: true },
      { label: 'Desafios', href: '/challenges', icon: Trophy, permission: 'challenges:read', soon: true },
      { label: 'CRM', href: '/crm', icon: KanbanSquare, permission: 'crm:read', soon: true },
      { label: 'Relatórios', href: '/reports', icon: BarChart3, permission: 'reports:read', soon: true },
      { label: 'Notificações', href: '/notifications', icon: Bell, permission: 'notifications:read', soon: true },
    ],
  },
  {
    label: 'Plataforma',
    items: [
      { label: 'Configurações', href: '/settings', icon: Settings, permission: 'settings:read' },
      { label: 'Synse Admin', href: '/synse-admin', icon: Sparkles, permission: 'platform:read' },
    ],
  },
]
