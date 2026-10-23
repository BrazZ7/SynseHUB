import { ChevronDown } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/**
 * Uma seção que abre ao toque, dentro da gaveta da conta.
 *
 * A gaveta tinha quatro cartões abertos, um embaixo do outro, e rolava muito
 * para achar qualquer coisa. Recolhidos, cabem todos na primeira tela: a
 * pessoa vê a lista do que existe e abre só o que veio procurar.
 *
 * ── `<details>`, e não estado em React ──────────────────────────────────────
 *
 * Abrir e fechar é comportamento que o HTML já tem. Usar `<details>` custa
 * **zero JavaScript**: nada disto entra no pacote do navegador, e o conteúdo
 * lá dentro continua sendo renderizado no servidor. De graça vêm também o
 * teclado, o leitor de tela anunciando expandido ou recolhido, e o Ctrl+F do
 * navegador, que abre a seção ao encontrar texto escondido.
 *
 * Um acordeão em `useState` aqui seria mais código, mais pacote e menos
 * acessível.
 */
export function SecaoRecolhivel({
  titulo,
  icone: Icone,
  perigo = false,
  children,
}: {
  titulo: string
  icone: LucideIcon
  /** Encerrar conta usa a cor de perigo, como já usava no cartão. */
  perigo?: boolean
  children: React.ReactNode
}) {
  return (
    <details
      className={`vidro-led group overflow-hidden rounded-2xl border bg-synse-surface ${
        perigo ? 'border-synse-danger/30' : 'border-synse-border'
      }`}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 text-sm font-semibold text-synse-text [&::-webkit-details-marker]:hidden">
        <Icone
          className={`size-4 shrink-0 ${perigo ? 'text-synse-danger' : 'text-synse-muted'}`}
          aria-hidden
        />
        <span className="flex-1">{titulo}</span>
        <ChevronDown
          className="size-4 shrink-0 text-synse-muted transition-transform duration-200 group-open:rotate-180"
          aria-hidden
        />
      </summary>

      <div className="border-t border-synse-border px-4 pb-4 pt-4">{children}</div>
    </details>
  )
}
