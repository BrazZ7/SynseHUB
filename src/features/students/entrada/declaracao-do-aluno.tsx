import { CalendarRange, Sparkles, Target } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { rotuloDaExperiencia, rotuloDoObjetivo } from '@/features/students/entrada/state'
import type { StudentIntake } from '@/types/domain'

/**
 * ── O que o aluno declarou na entrada guiada (0063) ──────────────────────────
 *
 * Fica na aba Treinos porque é ali que o professor monta o plano, e é para
 * isso que a informação existe.
 *
 * ── Por que não se mistura com o "Objetivo" da visão geral ───────────────────
 *
 * Aquele é `students.goal`: texto livre que a **academia** escreveu no
 * cadastro. Este é o que a pessoa escolheu sobre si. Os dois podem divergir —
 * a recepção anota "emagrecimento" na matrícula e o aluno escolhe
 * "condicionamento" —, e a divergência é informação, não erro. Juntar os dois
 * num campo só apagaria um dos autores.
 *
 * Sem componente nenhum quando não há resposta: o espaço vazio diria "este
 * aluno não tem objetivo", e o certo é "ninguém perguntou ainda".
 */
export function DeclaracaoDoAluno({ intake }: { intake: StudentIntake | null }) {
  if (!intake?.completedAt) return null

  const objetivo = rotuloDoObjetivo(intake.goal)
  const experiencia = rotuloDaExperiencia(intake.experience)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-synse-muted" aria-hidden />O que o aluno quer
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Item icone={Target} rotulo="Objetivo" valor={objetivo} />
          <Item icone={Sparkles} rotulo="Experiência" valor={experiencia} />
          <Item
            icone={CalendarRange}
            rotulo="Disponibilidade"
            valor={
              intake.daysPerWeek
                ? `${intake.daysPerWeek} ${intake.daysPerWeek > 1 ? 'dias' : 'dia'} por semana`
                : null
            }
          />
        </dl>
        <p className="mt-3 text-xs text-synse-muted">
          Declarado pelo próprio aluno. O objetivo da ficha, na visão geral, é o que a academia
          anotou no cadastro.
        </p>
      </CardContent>
    </Card>
  )
}

function Item({
  icone: Icone,
  rotulo,
  valor,
}: {
  icone: typeof Target
  rotulo: string
  valor: string | null
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs text-synse-muted">
        <Icone className="size-3.5" aria-hidden />
        {rotulo}
      </dt>
      {/* `—` e não vazio: a trava da 0063 garante que isto não acontece com
          `completedAt` preenchido, e o traço é o que denuncia se acontecer. */}
      <dd className="mt-0.5 font-medium text-synse-text">{valor ?? '—'}</dd>
    </div>
  )
}
