import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

/**
 * Voltar dentro do app, sem depender do navegador.
 *
 * Aponta para a tela de origem, não para o histórico. `router.back()` parece
 * mais natural e falha no caso que mais acontece: quem chega por link de
 * e-mail ou notificação não tem histórico dentro do app, e "voltar" o joga
 * para fora — para o e-mail, ou para uma página em branco. Destino fixo sempre
 * leva a um lugar do produto.
 *
 * O rótulo é o nome de onde a pessoa vai chegar, não a palavra "voltar": saber
 * o destino antes de tocar vale mais do que saber a direção.
 */
export function AppBackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="focus-visible:ring-synse-primary/25 -ml-1.5 inline-flex items-center gap-0.5 rounded-lg py-1 pl-1 pr-2 text-sm text-synse-muted transition-colors hover:text-synse-text focus-visible:outline-none focus-visible:ring-2"
    >
      <ChevronLeft className="size-4" aria-hidden />
      {label}
    </Link>
  )
}
