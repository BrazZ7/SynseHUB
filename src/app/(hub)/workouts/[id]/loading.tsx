import { Skeleton } from '@/components/ui/skeleton'

/** Ver `students/[id]/loading.tsx`: a barreira precisa estar no segmento que muda. */
export default function WorkoutLoading() {
  return (
    <div className="mx-auto max-w-4xl space-y-5" aria-busy>
      <Skeleton className="h-4 w-24" />
      <div className="space-y-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-8 w-64" />
      </div>
      <Skeleton className="h-96" />
    </div>
  )
}
