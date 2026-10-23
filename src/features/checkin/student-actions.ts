'use server'

import { revalidatePath } from 'next/cache'

import { requireStudentSession } from '@/lib/auth/require-session'
import { TIMEZONE } from '@/config/app'
import { inicioDoDiaLocal } from '@/features/students/janelas'
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
    const limit = await rateLimit(`student-checkin:${session.studentId}`, 5, 60_000)
    if (!limit.allowed) {
      return { status: 'error', message: 'Aguarde um instante antes de tentar novamente.' }
    }

    const dataSource = await getDataSource()
    /*
     * Meia-noite no fuso do produto, não no do servidor.
     *
     * Era `new Date(ano, mes, dia)`, que em UTC vira o dia às 21h de Brasília:
     * entre as 21h e a meia-noite o guarda deixava passar um segundo check-in
     * do mesmo dia. Dois check-ins num dia inflam a meta da semana e a
     * contagem do mês — a contagem duplicada que o pedido manda evitar.
     */
    const todayStart = inicioDoDiaLocal(new Date(), TIMEZONE)

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
    if (!(error instanceof AppError))
      logger.error('checkin:student_failed', { error: String(error) })
    return { status: 'error', message: toUserMessage(error) }
  }
}
