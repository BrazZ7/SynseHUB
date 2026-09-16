'use server'

import { revalidatePath } from 'next/cache'

import { requireHubSession, requireStudentSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { AppError, toUserMessage } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { requirePermission } from '@/lib/permissions/guard'
import {
  attendanceSchema,
  bookingSchema,
  cancelBookingSchema,
  cancelSessionSchema,
  saveClassScheduleSchema,
} from '@/lib/validations/schedule'
import type { ScheduleActionState } from '@/features/schedule/state'

const erro = (parsed: { error: { issues: { message: string }[]; flatten: () => { fieldErrors: unknown } } }) => ({
  status: 'error' as const,
  message: parsed.error.issues[0]?.message ?? 'Revise os campos destacados.',
  fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
})

/**
 * Cria ou corrige a regra semanal da aula.
 *
 * Corrigir a regra vale para as próximas aulas, não para as que já existem: as
 * de trás carregam presença, e reescrevê-las apagaria quem esteve lá.
 */
export async function saveClassScheduleAction(
  _state: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  const session = await requireHubSession()

  try {
    requirePermission(session, 'schedule:write')

    const parsed = saveClassScheduleSchema.safeParse({
      name: formData.get('name') ?? '',
      description: formData.get('description') ?? '',
      staffId: formData.get('staffId') ?? '',
      weekday: formData.get('weekday') ?? '1',
      startTime: formData.get('startTime') ?? '',
      durationMinutes: formData.get('durationMinutes') ?? '60',
      capacity: formData.get('capacity') ?? '',
      room: formData.get('room') ?? '',
      startsOn: formData.get('startsOn') ?? '',
      endsOn: formData.get('endsOn') ?? '',
      status: formData.get('status') ?? 'ACTIVE',
    })
    if (!parsed.success) return erro(parsed)

    const scheduleId = String(formData.get('scheduleId') ?? '')
    const dataSource = await getDataSource()

    if (scheduleId) {
      const existente = await dataSource.getClassSchedule(session.organizationId, scheduleId)
      if (!existente) return { status: 'error', message: 'Aula não encontrada nesta academia.' }
    }

    const dados = parsed.data
    const regra = await dataSource.saveClassSchedule({
      id: scheduleId || undefined,
      organizationId: session.organizationId,
      name: dados.name,
      description: dados.description || null,
      staffId: dados.staffId || null,
      weekday: dados.weekday,
      startTime: dados.startTime,
      durationMinutes: dados.durationMinutes,
      capacity: dados.capacity,
      room: dados.room || null,
      startsOn: dados.startsOn,
      endsOn: dados.endsOn || null,
      status: dados.status,
    })

    /*
     * Materializa já. Sem isto a aula nova só apareceria quando o agendamento
     * diário rodasse — e a recepção acabou de cadastrar a aula de amanhã.
     */
    const criadas = await dataSource.generateClassSessions(21)

    logger.info(scheduleId ? 'schedule:updated' : 'schedule:created', {
      organizationId: session.organizationId,
      scheduleId: regra.id,
      sessionsCreated: criadas,
      actorId: session.userProfileId,
    })

    revalidatePath('/schedule')
    revalidatePath('/app/schedule')

    return {
      status: 'success',
      message: scheduleId
        ? 'Grade atualizada. As aulas já criadas continuam como estavam.'
        : `Aula na grade. ${criadas} ocorrências criadas nas próximas três semanas.`,
      savedId: regra.id,
    }
  } catch (error) {
    if (!(error instanceof AppError)) logger.error('schedule:save_failed', { error: String(error) })
    return { status: 'error', message: toUserMessage(error) }
  }
}

/** Cancela a aula de um dia. O gatilho avisa quem ia e desfaz as reservas. */
export async function cancelSessionAction(
  _state: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  const session = await requireHubSession()

  try {
    requirePermission(session, 'schedule:write')

    const parsed = cancelSessionSchema.safeParse({
      sessionId: formData.get('sessionId') ?? '',
      reason: formData.get('reason') ?? '',
    })
    if (!parsed.success) return erro(parsed)

    const dataSource = await getDataSource()
    const aula = await dataSource.getClassSession(session.organizationId, parsed.data.sessionId)
    if (!aula) return { status: 'error', message: 'Aula não encontrada nesta academia.' }
    if (aula.status === 'CANCELLED') {
      return { status: 'error', message: 'Esta aula já estava cancelada.' }
    }

    await dataSource.cancelClassSession(
      session.organizationId,
      parsed.data.sessionId,
      parsed.data.reason || null,
    )

    logger.info('schedule:session_cancelled', {
      organizationId: session.organizationId,
      sessionId: parsed.data.sessionId,
      booked: aula.bookedCount,
      actorId: session.userProfileId,
    })

    revalidatePath('/schedule')
    revalidatePath(`/schedule/session/${parsed.data.sessionId}`)
    revalidatePath('/app/schedule')

    return {
      status: 'success',
      message: `Aula cancelada. ${aula.bookedCount} ${aula.bookedCount === 1 ? 'aluno foi avisado' : 'alunos foram avisados'}.`,
    }
  } catch (error) {
    if (!(error instanceof AppError)) {
      logger.error('schedule:cancel_session_failed', { error: String(error) })
    }
    return { status: 'error', message: toUserMessage(error) }
  }
}

/** Presença, marcada pela equipe na tela da aula. */
export async function markAttendanceAction(
  _state: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  const session = await requireHubSession()

  try {
    requirePermission(session, 'schedule:write')

    const parsed = attendanceSchema.safeParse({
      bookingId: formData.get('bookingId') ?? '',
      sessionId: formData.get('sessionId') ?? '',
      status: formData.get('status') ?? 'ATTENDED',
    })
    if (!parsed.success) return erro(parsed)

    const dataSource = await getDataSource()
    /*
     * A reserva precisa ser de uma aula desta academia. A RLS barraria de
     * qualquer forma; a leitura aqui é para o erro dizer o que houve.
     */
    const reservas = await dataSource.listClassBookings(
      session.organizationId,
      parsed.data.sessionId,
    )
    if (!reservas.some((r) => r.id === parsed.data.bookingId)) {
      return { status: 'error', message: 'Reserva não encontrada nesta aula.' }
    }

    await dataSource.markAttendance(session.organizationId, parsed.data.bookingId, parsed.data.status)

    revalidatePath(`/schedule/session/${parsed.data.sessionId}`)
    return { status: 'success', message: 'Presença registrada.' }
  } catch (error) {
    if (!(error instanceof AppError)) {
      logger.error('schedule:attendance_failed', { error: String(error) })
    }
    return { status: 'error', message: toUserMessage(error) }
  }
}

/** A recepção marca um aluno por telefone. */
export async function bookForStudentAction(
  _state: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  const session = await requireHubSession()

  try {
    requirePermission(session, 'schedule:write')

    const parsed = bookingSchema.safeParse({
      sessionId: formData.get('sessionId') ?? '',
      studentId: formData.get('studentId') ?? '',
    })
    if (!parsed.success) return erro(parsed)
    if (!parsed.data.studentId) return { status: 'error', message: 'Escolha o aluno.' }

    const dataSource = await getDataSource()
    const resultado = await dataSource.bookClass(parsed.data.sessionId, parsed.data.studentId)

    revalidatePath(`/schedule/session/${parsed.data.sessionId}`)
    revalidatePath('/schedule')

    return {
      status: 'success',
      message:
        resultado === 'WAITLIST'
          ? 'Turma cheia: o aluno entrou na lista de espera e sobe assim que alguém desmarcar.'
          : 'Aluno confirmado na aula.',
    }
  } catch (error) {
    if (!(error instanceof AppError)) logger.error('schedule:book_failed', { error: String(error) })
    return { status: 'error', message: toUserMessage(error) }
  }
}

/** O aluno reserva pelo app. Quem decide vaga ou espera é o banco. */
export async function bookClassAction(
  _state: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  await requireStudentSession()

  try {
    const parsed = bookingSchema.safeParse({ sessionId: formData.get('sessionId') ?? '' })
    if (!parsed.success) return erro(parsed)

    const dataSource = await getDataSource()
    const resultado = await dataSource.bookClass(parsed.data.sessionId)

    revalidatePath('/app/schedule')
    revalidatePath('/app')

    return {
      status: 'success',
      message:
        resultado === 'WAITLIST'
          ? 'Turma cheia. Você entrou na lista de espera e avisamos se abrir vaga.'
          : 'Vaga confirmada. Até lá!',
    }
  } catch (error) {
    if (!(error instanceof AppError)) {
      logger.error('schedule:student_book_failed', { error: String(error) })
    }
    return { status: 'error', message: toUserMessage(error) }
  }
}

/** Desmarcar. A promoção da fila é do gatilho, não daqui. */
export async function cancelBookingAction(
  _state: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  await requireStudentSession()

  try {
    const parsed = cancelBookingSchema.safeParse({ bookingId: formData.get('bookingId') ?? '' })
    if (!parsed.success) return erro(parsed)

    const dataSource = await getDataSource()
    /*
     * Sem checagem de dono aqui de propósito: `cancel_class_booking` confere no
     * banco, com `owns_student`. Duplicar a regra na aplicação criaria dois
     * lugares para ela divergir.
     */
    await dataSource.cancelClassBooking(parsed.data.bookingId)

    revalidatePath('/app/schedule')
    revalidatePath('/app')

    return { status: 'success', message: 'Reserva desmarcada. A vaga foi para quem estava esperando.' }
  } catch (error) {
    if (!(error instanceof AppError)) {
      logger.error('schedule:cancel_booking_failed', { error: String(error) })
    }
    return { status: 'error', message: toUserMessage(error) }
  }
}
