import { Badge } from '@/components/ui/badge'
import type { ChargeStatus, StudentStatus } from '@/types/domain'

/**
 * Semântica de cor do Synse — tons dessaturados, legíveis em ambos os temas.
 * Pago = verde · Pendente = amarelo · Atrasado = vermelho · Cancelado = cinza.
 */
const CHARGE_STATUS = {
  PAID: { label: 'Pago', variant: 'success' },
  PENDING: { label: 'Pendente', variant: 'warning' },
  OVERDUE: { label: 'Atrasado', variant: 'danger' },
  CANCELLED: { label: 'Cancelado', variant: 'default' },
  REFUNDED: { label: 'Estornado', variant: 'outline' },
  FAILED: { label: 'Falhou', variant: 'danger' },
} as const satisfies Record<ChargeStatus, { label: string; variant: string }>

const STUDENT_STATUS = {
  ACTIVE: { label: 'Ativo', variant: 'success' },
  INACTIVE: { label: 'Inativo', variant: 'default' },
  OVERDUE: { label: 'Inadimplente', variant: 'danger' },
  PENDING: { label: 'Pendente', variant: 'warning' },
  CANCELLED: { label: 'Cancelado', variant: 'default' },
} as const satisfies Record<StudentStatus, { label: string; variant: string }>

type Variant = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'outline'

export function PaymentStatus({ status }: { status: ChargeStatus }) {
  const config = CHARGE_STATUS[status]
  return <Badge variant={config.variant as Variant}>{config.label}</Badge>
}

export function StudentStatusBadge({ status }: { status: StudentStatus }) {
  const config = STUDENT_STATUS[status]
  return <Badge variant={config.variant as Variant}>{config.label}</Badge>
}

export function StatusBadge({ label, variant = 'default' }: { label: string; variant?: Variant }) {
  return <Badge variant={variant}>{label}</Badge>
}
