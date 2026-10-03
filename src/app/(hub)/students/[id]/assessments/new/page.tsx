import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { BackLink } from '@/components/synse/back-link'
import { PageHeader } from '@/components/synse/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { AssessmentForm } from '@/features/assessments/assessment-form'
import { idadeEm } from '@/features/assessments/composition'
import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'

export const metadata: Metadata = { title: 'Nova avaliação' }

type Params = Promise<{ id: string }>

export default async function NewAssessmentPage({ params }: { params: Params }) {
  const { id } = await params
  const session = await requireHubSession('assessments:write')
  const dataSource = await getDataSource()

  const [student, anteriores] = await Promise.all([
    dataSource.getStudent(session.organizationId, id),
    dataSource.listAssessments(session.organizationId, id),
  ])

  if (!student) notFound()

  const hoje = new Date().toISOString().slice(0, 10)
  /*
   * A altura não muda entre avaliações de um adulto, mas some da ficha se
   * ninguém redigitar — e sem altura não há IMC. Vem da última avaliação que
   * registrou uma.
   */
  const alturaSugerida =
    [...anteriores].reverse().find((avaliacao) => avaliacao.height != null)?.height ?? null

  return (
    <div className="mx-auto max-w-4xl space-y-5 animate-fade-in-up">
      <BackLink href={`/students/${student.id}`} label={student.name} />

      <PageHeader
        title="Nova avaliação"
        description={`Medidas de ${student.name}. IMC, densidade e percentual de gordura são calculados no servidor a partir do que for preenchido aqui.`}
      />

      <Card>
        <CardContent className="pt-5">
          <AssessmentForm
            studentId={student.id}
            studentName={student.name}
            hoje={hoje}
            alturaSugerida={alturaSugerida}
            idadeSugerida={idadeEm(student.birthDate, hoje)}
          />
        </CardContent>
      </Card>
    </div>
  )
}
