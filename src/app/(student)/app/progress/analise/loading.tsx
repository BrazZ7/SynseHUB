import { Skeleton } from '@/components/ui/skeleton'

/**
 * A análise faz cinco consultas antes de desenhar. Sem este limite o clique no
 * Progresso deixaria a tela anterior congelada — o defeito que a passada de
 * navegação corrigiu nas outras listas.
 */
export default function AnaliseLoading() {
  return (
    <div className="space-y-5" aria-busy>
      <Skeleton className="h-5 w-24" />
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-full max-w-sm" />
      </div>
      {Array.from({ length: 3 }).map((_, indice) => (
        <Skeleton key={indice} className="h-40 rounded-2xl" />
      ))}
    </div>
  )
}
