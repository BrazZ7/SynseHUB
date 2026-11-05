import { Skeleton } from '@/components/ui/skeleton'

/**
 * Esqueleto do treino em andamento.
 *
 * "Iniciar treino" é um elo, não uma ação: abrir esta tela é uma navegação
 * como qualquer outra, e sem barreira própria a pessoa fica olhando a lista
 * de treinos parada depois de tocar no botão.
 */
export default function ActiveWorkoutLoading() {
  return (
    <div className="space-y-4" aria-busy>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-28" />
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-20" />
      ))}
    </div>
  )
}
