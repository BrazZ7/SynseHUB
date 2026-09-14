'use server'

import { revalidatePath } from 'next/cache'

import { parseClassScheduleForm } from '@/features/schedule/form'
import type { ScheduleActionState } from '@/features/schedule/state'
import { requireHubSession } from '@/lib/auth/require-session'
import { createSupabaseAdminClient } from '@/lib/database/supabase-admin'
import { createSupabaseServerClient } from '@/lib/database/supabase-server'
import { AppError, toUserMessage } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { requirePermission } from '@/lib/permissions/guard'
import { createClassScheduleSchema } from '@/lib/validations/schedule'

export async function createClassScheduleAction(
  _state: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  const session = await requireHubSession()

  try {
    requirePermission(session, 'schedule:write')

    const parsed = createClassScheduleSchema.safeParse(
      parseClassScheduleForm(Object.fromEntries(formData) as Record<string, string>),
    )

    if (!parsed.success) {
      return {
        status: 'error',
        message: 'Revise os campos destacados.',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      }
    }

    const supabase = await createSupabaseServerClient()
    if (!supabase) {
      return {
        status: 'success',
        message: 'Aula criada no modo demonstração.',
        generatedSessions: 0,
      }
    }

    const admin = createSupabaseAdminClient()
    if (!admin) {
      return {
        status: 'error',
        message: 'A agenda precisa da chave de serviço do Supabase para gerar as aulas.',
      }
    }

    const staffId = parsed.data.staffId ?? null
    if (staffId) {
      const { data: staff, error: staffError } = await supabase
        .from('staff')
        .select('id')
        .eq('organization_id', session.organizationId)
        .eq('id', staffId)
        .maybeSingle()

      if (staffError) throw staffError
      if (!staff) {
        return {
          status: 'error',
          message: 'Revise os campos destacados.',
          fieldErrors: { staffId: ['Escolha um profissional desta academia.'] },
        }
      }
    }

    const { data: schedule, error } = await supabase
      .from('class_schedules')
      .insert({
        organization_id: session.organizationId,
        name: parsed.data.name,
        description: parsed.data.description || null,
        staff_id: staffId,
        weekday: parsed.data.weekday,
        start_time: parsed.data.startTime,
        duration_minutes: parsed.data.durationMinutes,
        capacity: parsed.data.capacity,
        room: parsed.data.room || null,
        starts_on: parsed.data.startsOn,
        ends_on: parsed.data.endsOn ?? null,
        status: 'ACTIVE',
      })
      .select('id,name')
      .single()

    if (error) throw error

    const { data: generated, error: generateError } = await admin.rpc('generate_class_sessions', {
      p_days_ahead: parsed.data.daysAhead,
      p_reference: parsed.data.startsOn,
    })

    if (generateError) {
      await supabase
        .from('class_schedules')
        .delete()
        .eq('organization_id', session.organizationId)
        .eq('id', schedule.id)
      throw generateError
    }

    logger.info('schedule:class_created', {
      organizationId: session.organizationId,
      scheduleId: schedule.id,
      actorId: session.userProfileId,
      generatedSessions: generated ?? 0,
    })

    revalidatePath('/schedule')
    revalidatePath('/schedule/new')
    revalidatePath('/dashboard')

    return {
      status: 'success',
      message: `${schedule.name} criada. Aulas geradas para a agenda.`,
      createdId: schedule.id,
      generatedSessions: Number(generated ?? 0),
    }
  } catch (error) {
    if (!(error instanceof AppError)) {
      logger.error('schedule:create_class_failed', { error: String(error) })
    }
    return { status: 'error', message: toUserMessage(error) }
  }
}
