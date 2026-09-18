import { AppBottomNavigation } from '@/components/synse/app-bottom-navigation'
import { ContextBar } from '@/features/platform/context-bar'
import { requireStudentSession } from '@/lib/auth/require-session'

/**
 * Casca do Synse App.
 *
 * Deliberadamente diferente do painel: sem sidebar, sem tabela, largura de
 * telefone mesmo no desktop. O aluno precisa sentir que está no aplicativo
 * pessoal dele — não num sistema administrativo.
 */
export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const session = await requireStudentSession()

  return (
    <div className="min-h-svh bg-synse-bg">
      <div className="mx-auto w-full max-w-lg px-5 pb-24 pt-6">
        {/* Nada para conta comum. Ver `ContextBar`. */}
        <div className="mb-4 flex justify-end empty:hidden">
          <ContextBar session={session} />
        </div>
        {children}
      </div>
      <AppBottomNavigation />
    </div>
  )
}
