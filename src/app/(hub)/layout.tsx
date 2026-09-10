import { HubSidebar } from '@/components/synse/hub-sidebar'
import { HubTopbar } from '@/components/synse/hub-topbar'
import { HUB_NAVIGATION } from '@/config/navigation'
import { signOut } from '@/lib/auth/actions'
import { requireHubSession } from '@/lib/auth/require-session'
import { can } from '@/lib/permissions/permissions'

/**
 * Casca do SynseHub.
 *
 * A navegação é filtrada aqui, no servidor, com base no papel — o menu nunca
 * expõe uma área que a sessão não pode abrir, e cada página revalida a
 * permissão por conta própria.
 */
export default async function HubLayout({ children }: { children: React.ReactNode }) {
  const session = await requireHubSession()

  // Apenas URLs atravessam o limite servidor→cliente: ícones são componentes.
  const allowedHrefs = HUB_NAVIGATION.flatMap((group) =>
    group.items.filter((item) => can(session.role, item.permission)).map((item) => item.href),
  )

  return (
    <div className="flex min-h-svh bg-synse-bg lg:gap-0">
      <HubSidebar
        allowedHrefs={allowedHrefs}
        user={{ name: session.name, email: session.email, role: session.role }}
        organizationName={session.organizationName}
        signOutAction={signOut}
      />

      <div className="flex min-w-0 flex-1 flex-col pt-16 lg:pt-0">
        <HubTopbar organizationName={session.organizationName} />
        <main className="mx-auto w-full min-w-0 max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  )
}
