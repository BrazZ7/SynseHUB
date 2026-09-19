'use server'

import { revalidatePath } from 'next/cache'

import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { AppError, notFound, toUserMessage } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { requirePermission } from '@/lib/permissions/guard'
import { rateLimit } from '@/lib/rate-limit'
import { manualCheckInSchema } from '@/lib/validations/checkin'
import type { CheckInState } from '@/features/checkin/state'

/** Registro de presença feito pela recepção. */
export async function registerCheckInAction(
  _state: CheckInState,
  formData: FormData,
): Promise<CheckInState> {
  const session = await requireHubSession()

  try {
    requirePermission(session, 'checkin:write')

    const parsed = manualCheckInSchema.safeParse({ studentId: formData.get('studentId') })
    if (!parsed.success) return { status: 'error', message: 'Selecione um aluno para registrar.' }

    const limit = rateLimit(`checkin:${session.organizationId}`, 120, 60_000)
    if (!limit.allowed) {
      return { status: 'error', message: 'Muitos registros seguidos. Aguarde alguns segundos.' }
    }

    const dataSource = await getDataSource()
    const student = await dataSource.getStudent(session.organizationId, parsed.data.studentId)
    if (!student) throw notFound('aluno')

    await dataSource.createCheckIn({
      organizationId: session.organizationId,
      studentId: student.id,
      method: 'MANUAL',
    })

    logger.info('checkin:registered', {
      organizationId: session.organizationId,
      studentId: student.id,
      actorId: session.userProfileId,
      method: 'MANUAL',
    })

    revalidatePath('/checkin')
    revalidatePath('/dashboard')

    return { status: 'success', message: 'Check-in registrado.', studentName: student.name }
  } catch (error) {
    if (!(error instanceof AppError)) logger.error('checkin:failed', { error: String(error) })
    return { status: 'error', message: toUserMessage(error) }
  }
}
