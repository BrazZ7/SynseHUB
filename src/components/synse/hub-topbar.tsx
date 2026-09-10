import { Bell } from 'lucide-react'

import { ThemeToggle } from '@/components/synse/theme-toggle'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { isSimulatedProvider } from '@/lib/payments'
import { isDemoMode } from '@/lib/database/env'

/** Faixa superior do painel. Sinaliza sem rodeios quando o ambiente é simulado. */
export function HubTopbar({ organizationName }: { organizationName: string }) {
  const demo = isDemoMode()
  const simulatedPayments = isSimulatedProvider()

  return (
    <div className="sticky top-0 z-20 hidden items-center justify-between gap-4 border-b border-synse-border bg-synse-bg/80 px-8 py-3 backdrop-blur-md lg:flex">
      <div className="flex items-center gap-2.5">
        <span className="text-sm font-medium text-synse-text">{organizationName}</span>
        {demo && (
          <Badge variant="warning" title="Nenhum banco de dados conectado — dados de demonstração.">
            Modo demonstração
          </Badge>
        )}
        {simulatedPayments && (
          <Badge variant="outline" title="Nenhum valor real é movimentado.">
            Synse Pay simulado
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-1">
        <ThemeToggle />
        <Button variant="ghost" size="icon" aria-label="Notificações">
          <Bell className="size-4" />
        </Button>
      </div>
    </div>
  )
}
