import Link from 'next/link'

import { SynseLogo } from '@/components/synse/synse-logo'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-synse-bg px-6 text-center">
      <SynseLogo size="lg" showTagline />
      <div className="space-y-2">
        <h1 className="text-subtitle font-semibold text-synse-text">Página não encontrada</h1>
        <p className="max-w-md text-sm text-synse-muted">
          O endereço acessado não existe ou foi movido. Volte ao painel para continuar.
        </p>
      </div>
      <Button asChild>
        <Link href="/dashboard">Ir para o painel</Link>
      </Button>
    </div>
  )
}
