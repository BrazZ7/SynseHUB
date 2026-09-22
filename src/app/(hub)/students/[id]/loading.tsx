import { Skeleton } from '@/components/ui/skeleton'

/**
 * Esqueleto da ficha do aluno.
 *
 * Existe um `loading.tsx` no grupo `(hub)`, e ele **não** cobre esta
 * navegação: medido no navegador, clicar num aluno deixava a tela anterior
 * parada por 1,8 s com 800 ms de latência, sem sequer trocar a URL. A barreira
 * precisa estar no segmento que muda.
 */
export default function StudentLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-5" aria-busy>
      <Skeleton className="h-4 w-24" />
      <div className="flex items-center gap-4">
        <Skeleton className="size-14 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-52" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  )
}
