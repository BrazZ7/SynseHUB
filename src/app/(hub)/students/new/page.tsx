import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

import { PageHeader } from '@/components/synse/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { NewStudentForm } from '@/features/students/new-student-form'
import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'

export const metadata: Metadata = { title: 'Novo aluno' }

export default async function NewStudentPage() {
  const session = await requireHubSession('students:write')
  const dataSource = await getDataSource()

  const [plans, staff] = await Promise.all([
    dataSource.listPlans(session.organizationId),
    dataSource.listStaff(session.organizationId),
  ])

  const trainers = staff
    .filter((member) => member.role === 'TRAINER' || member.role === 'PROFESSIONAL')
    .map((member) => ({ id: member.id, name: member.name }))

  return (
    <div className="mx-auto max-w-3xl space-y-5 animate-fade-in-up">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/students">
          <ChevronLeft className="size-4" />
          Alunos
        </Link>
      </Button>

      <PageHeader
        title="Novo aluno"
        description="A matrícula cria um Synse ID vitalício — a conta do aluno sobrevive ao vínculo com a academia."
      />

      <Card>
        <CardContent className="pt-5">
          <NewStudentForm plans={plans.filter((plan) => plan.status === 'ACTIVE')} trainers={trainers} />
        </CardContent>
      </Card>
    </div>
  )
}
