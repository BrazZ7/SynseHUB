import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { BackLink } from '@/components/synse/back-link'
import { PageHeader } from '@/components/synse/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { AssessmentForm } from '@/features/assessments/assessment-form'
import { idadeEm } from '@/features/assessments/composition'
import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Avaliação' }

type Params = Promise<{ id: string; assessmentId: string }>

export default async function EditAssessmentPage({ params }: { params: Params }) {
  const { id, assessmentId } = await params
  const session = await requireHubSession('assessments:write')
  const dataSource = await getDataSource()

  const [student, assessment] = await Promise.all([
    dataSource.getStudent(session.organizationId, id),
    dataSource.getAssessment(session.organizationId, assessmentId),
  ])

  // Avaliação de outro aluno com este id na URL não é "não encontrada por
  // acaso": é a única resposta que não confirma que ela existe.
  if (!student || !assessment || assessment.studentId !== student.id) notFound()

  const hoje = new Date().toISOString().slice(0, 10)

  return (
    <div className="mx-auto max-w-4xl space-y-5 animate-fade-in-up">
      <BackLink href={`/students/${student.id}`} label={student.name} />

      <PageHeader
        title={`Avaliação de ${formatDate(assessment.assessedAt)}`}
        description={`Corrigir uma medida refaz o cálculo. O histórico de ${student.name} continua o mesmo — esta avaliação é atualizada, não duplicada.`}
      />

      <Card>
        <CardContent className="pt-5">
          <AssessmentForm
            studentId={student.id}
            studentName={student.name}
            hoje={hoje}
            alturaSugerida={assessment.height}
            idadeSugerida={idadeEm(student.birthDate, assessment.assessedAt)}
            assessment={assessment}
          />
        </CardContent>
      </Card>
    </div>
  )
}
