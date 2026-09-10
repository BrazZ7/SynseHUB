'use server'

import { revalidatePath } from 'next/cache'

import { requireStudentSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { conflict, AppError, toUserMessage } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { rateLimit } from '@/lib/rate-limit'
import type { CheckInState } from '@/features/checkin/state'

/**
 * Check-in feito pelo próprio aluno no Synse App.
 *
 * O aluno só pode registrar presença para si mesmo — o `studentId` vem da
 * sessão, nunca do formulário. Um segundo check-in no mesmo dia é recusado.
 */
export async function studentCheckInAction(): Promise<CheckInState> {
  const session = await requireStudentSession()

  try {
    const limit = rateLimit(`student-checkin:${session.studentId}`, 5, 60_000)
    if (!limit.allowed) {
      return { status: 'error', message: 'Aguarde um instante antes de tentar novamente.' }
    }

    const dataSource = await getDataSource()
    const today = new Date()
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()

    const recent = await dataSource.listCheckInsForStudent(
      session.organizationId,
      session.studentId,
      5,
    )
    if (recent.some((checkIn) => checkIn.checkedInAt >= todayStart)) {
      throw conflict('Você já registrou presença hoje.')
    }

    await dataSource.createCheckIn({
      organizationId: session.organizationId,
      studentId: session.studentId,
      method: 'APP',
    })

    logger.info('checkin:student_self', {
      organizationId: session.organizationId,
      studentId: session.studentId,
    })

    revalidatePath('/app')
    return { status: 'success', message: 'Presença registrada. Bom treino!' }
  } catch (error) {
    if (!(error instanceof AppError)) logger.error('checkin:student_failed', { error: String(error) })
    return { status: 'error', message: toUserMessage(error) }
  }
}
