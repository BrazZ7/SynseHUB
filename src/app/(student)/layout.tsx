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
 * ── A largura, e por que ela pôde crescer ───────────────────────────────────
 *
 * Era `max-w-lg` em qualquer tela, com a intenção de manter a cara de
 * aplicativo. Num iPad isso dava 512px numa tela de 1180: menos da metade
 * ocupada, moldura preta dos dois lados, e o app parecendo um emulador de
 * celular em vez de um aplicativo.
 *
 * O limite de antes era real: linha de texto corrida com mais de ~75
 * caracteres cansa de ler, e esticar uma pilha de coluna única até 1180px
 * trocaria o vazio por cartões largos demais. Mas o limite é **por coluna de
 * leitura**, não pela largura da casca — e agora as páginas do app se dividem
 * em duas colunas a partir do tablet (ver `PilhaDoApp`).
 *
 * Com duas colunas a conta é outra: 42rem no tablet dão duas colunas de ~326px
 * e 64rem no desktop dão duas de ~502px. Nenhuma passa do ponto em que a linha
 * cansa, e a tela enche. Medido: 672px em 820 (retrato) e 1024px em 1180
 * (paisagem) — 82% e 87% da tela, contra 62% e 43% antes.
 *
 * As páginas de **leitura e de passo único** ficam de fora da divisão: receita,
 * artigo, treino em andamento, formulário de pesagem, feed de notificações.
 * Lá a pessoa segue uma linha do começo ao fim — e no feed essa linha é a
 * cronologia, que em duas colunas ziguezaguearia. Elas prendem a própria
 * largura em `ColunaDeLeitura`, porque a casca cresceu para caber duas colunas
 * e uma coluna sozinha nessa largura é exatamente o que se queria evitar.
 */
export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const session = await requireStudentSession()

  return (
    <div className="min-h-svh bg-synse-bg">
      <div className="mx-auto w-full max-w-lg px-5 pb-24 pt-6 md:max-w-2xl lg:max-w-5xl">
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
