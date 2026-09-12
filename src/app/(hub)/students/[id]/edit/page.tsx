import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'

import { PageHeader } from '@/components/synse/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { StudentForm } from '@/features/students/student-form'
import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'

export const metadata: Metadata = { title: 'Editar aluno' }

type Params = Promise<{ id: string }>

export default async function EditStudentPage({ params }: { params: Params }) {
  const { id } = await params
  const session = await requireHubSession('students:write')
  const dataSource = await getDataSource()

  const [student, plans, staff] = await Promise.all([
    dataSource.getStudent(session.organizationId, id),
    dataSource.listPlans(session.organizationId),
    dataSource.listStaff(session.organizationId),
  ])

  if (!student) notFound()

  const membership = await dataSource.getActiveMembership(session.organizationId, student.id)

  const trainers = staff
    .filter((member) => member.role === 'TRAINER' || member.role === 'PROFESSIONAL')
    .map((member) => ({ id: member.id, name: member.name }))

  return (
    <div className="mx-auto max-w-3xl space-y-5 animate-fade-in-up">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href={`/students/${student.id}`}>
          <ChevronLeft className="size-4" />
          {student.name}
        </Link>
      </Button>

      <PageHeader
        title="Editar aluno"
        description="Corrige o cadastro e a mensalidade. O e-mail pertence à conta do aluno e não muda por aqui."
      />

      <Card>
        <CardContent className="pt-5">
          <StudentForm
            plans={plans.filter((plan) => plan.status === 'ACTIVE')}
            trainers={trainers}
            student={{
              id: student.id,
              name: student.name,
              email: student.email,
              phone: student.phone ?? '',
              taxId: student.taxId ?? '',
              goal: student.goal ?? '',
              planId: membership?.planId ?? '',
              trainerId: student.trainerId ?? '',
              billingDay: membership?.billingDay ?? 5,
            }}
          />
        </CardContent>
      </Card>
    </div>
  )
}
