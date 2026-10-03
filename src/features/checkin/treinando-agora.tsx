import { Dumbbell, Pause } from 'lucide-react'

import { EmptyState } from '@/components/synse/empty-state'
import { ListLink } from '@/components/synse/list-link'
import { StudentAvatar } from '@/components/synse/student-avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { haQuantoTempo } from '@/features/checkin/state'
import type { OngoingWorkout } from '@/types/domain'

/**
 * ── Quem está treinando agora ───────────────────────────────────────────────
 *
 * `workout_sessions` registra cada treino do Treino Ativo desde a 0026, e a
 * academia não tinha onde ver nenhum em andamento. O check-in diz quem
 * **entrou**; isto diz quem está no salão com um treino aberto, que não é a
 * mesma pessoa: tem quem passe o QR Code e vá para a esteira, e tem quem
 * treine sem ter passado por nada.
 *
 * ── O que esta tela mostra, e o que não mostra ──────────────────────────────
 *
 * Nome, treino, há quanto tempo e quantas séries. **Nenhuma carga, nenhum
 * número de saúde.** A recepção tem `checkin:read` e precisa saber quem está
 * no salão — isso é presença. Composição corporal e carga prescrita estão na
 * ficha, atrás de `assessments:read`, que a recepção não tem.
 *
 * ── Por que o tempo vem calculado do servidor ───────────────────────────────
 *
 * O minuto é formatado aqui, no servidor, e não com um relógio no navegador.
 * A página é recarregada pela recepção o tempo todo, e um contador correndo em
 * cada linha custaria um redesenho por segundo para informação que muda a cada
 * minuto. Quem quiser o número exato abre a ficha.
 */

export function TreinandoAgora({ treinos, agora }: { treinos: OngoingWorkout[]; agora: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Treinando agora
          {treinos.length > 0 && (
            <span className="ml-2 text-sm font-normal tabular-nums text-synse-muted">
              {treinos.length}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {treinos.length === 0 ? (
          <EmptyState
            icon={Dumbbell}
            title="Ninguém treinando pelo app agora"
            description="Aparece aqui quem está com um treino aberto no Treino Ativo, com o exercício e o tempo decorrido."
            className="py-8"
          />
        ) : (
          <ul className="divide-y divide-synse-border">
            {treinos.map((treino) => (
              <li key={treino.sessionId}>
                <ListLink
                  href={`/students/${treino.studentId}`}
                  className="flex items-center gap-3 py-2.5 transition-opacity hover:opacity-80"
                >
                  <StudentAvatar name={treino.studentName} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-synse-text">
                      {treino.studentName}
                    </span>
                    <span className="block truncate text-xs text-synse-muted">
                      {treino.planName ?? 'Treino livre'} · {treino.totalSets}{' '}
                      {treino.totalSets === 1 ? 'série' : 'séries'}
                    </span>
                  </span>
                  {treino.status === 'PAUSED' && (
                    <Badge variant="outline">
                      <Pause className="size-3" aria-hidden />
                      Pausado
                    </Badge>
                  )}
                  <span className="shrink-0 text-xs tabular-nums text-synse-muted">
                    {haQuantoTempo(treino.startedAt, agora)}
                  </span>
                </ListLink>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
