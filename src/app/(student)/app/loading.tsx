import { Skeleton } from '@/components/ui/skeleton'

/**
 * O esqueleto do Synse App.
 *
 * Existe por dois motivos, e o segundo é o que mais pesa.
 *
 * **O visível:** sem ele, tocar numa aba não fazia nada por quase um segundo —
 * a tela antiga ficava parada, sem pista de que algo aconteceu, e só então
 * trocava de uma vez. A pessoa tocava de novo achando que não pegou.
 *
 * **O invisível:** no App Router, o `<Link>` só consegue pré-carregar uma rota
 * dinâmica até a fronteira de `loading`. Sem este arquivo não havia fronteira,
 * então não havia pré-carregamento nenhum — cada toque começava do zero. Com
 * ele, o Next busca a casca enquanto o link está na tela, e o que sobra no
 * toque é só o conteúdo.
 *
 * O desenho imita a estrutura comum das telas do aluno — cabeçalho, cartões,
 * lista. Esqueleto que não se parece com o destino troca a espera por um
 * susto.
 */
export default function AppLoading() {
  return (
    <div className="space-y-5" aria-busy aria-live="polite">
      <span className="sr-only">Carregando</span>

      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>

      <Skeleton className="h-48 rounded-xl" />

      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
    </div>
  )
}
