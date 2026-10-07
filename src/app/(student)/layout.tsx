import { AppBottomNavigation } from '@/components/synse/app-bottom-navigation'
import { ContextBar } from '@/features/platform/context-bar'
import { requireStudentSession } from '@/lib/auth/require-session'

/**
 * Casca do Synse App.
 *
 * Deliberadamente diferente do painel: sem sidebar, sem tabela. O aluno
 * precisa sentir que está no aplicativo pessoal dele — não num sistema
 * administrativo.
 *
 * ── A largura deixou de ser só de telefone ──────────────────────────────────
 *
 * Era `max-w-lg` em qualquer tela, com a intenção de manter a cara de
 * aplicativo. Num iPad isso dava 512px numa tela de 1180: menos da metade
 * ocupada, moldura preta dos dois lados, e o app parecendo um emulador de
 * celular em vez de um aplicativo.
 *
 * A coluna cresce a partir do tablet, mas **não até a largura da tela**. Linha
 * de texto corrida com mais de ~75 caracteres cansa de ler, e esticar um
 * empilhamento de cartões de coluna única até 1180px resolveria o vazio
 * criando um problema pior. 42rem no tablet e 48rem daí para cima é o ponto em
 * que a tela parece cheia e o texto continua legível.
 *
 * Um layout de **duas colunas** no tablet ocuparia tudo de verdade, e é outro
 * trabalho: pede decisão página a página sobre o que fica ao lado do quê.
 */
export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const session = await requireStudentSession()

  return (
    <div className="min-h-svh bg-synse-bg">
      <div className="mx-auto w-full max-w-lg px-5 pb-24 pt-6 md:max-w-2xl lg:max-w-3xl">
        {/* Nada para conta comum. Ver `ContextBar`. */}
        <div className="mb-6 flex justify-end empty:hidden">
          <ContextBar session={session} />
        </div>
        {children}
      </div>
      <AppBottomNavigation />
    </div>
  )
}
