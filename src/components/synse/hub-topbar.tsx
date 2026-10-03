import { RotateCcw } from 'lucide-react'

import { ThemeToggle } from '@/components/synse/theme-toggle'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { resetDemoAction } from '@/features/demo/actions'
import { NotificationsBell } from '@/features/notifications/notifications-bell'
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
        {demo && (
          <form action={resetDemoAction}>
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              title="Apaga as alterações desta demonstração e volta ao estado inicial."
            >
              <RotateCcw className="size-4" />
              Reiniciar demonstração
            </Button>
          </form>
        )}
        <ThemeToggle />
        <NotificationsBell />
      </div>
    </div>
  )
}
