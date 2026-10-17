'use server'

import { revalidatePath } from 'next/cache'

import { requirePlatformSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { AppError, toUserMessage } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { saveProgramSchema, saveProgramStepSchema, tarefasDoTexto } from '@/lib/validations/program'
import type { ProgramAdminState } from '@/features/programs/admin-state'

/**
 * ── Publicar programa ───────────────────────────────────────────────────────
 *
 * Mesmo desenho do acervo (0039), e pelas mesmas razões: três travas em série.
 *
 * 1. `requirePlatformSession` — a rota inteira é de conta de plataforma.
 * 2. `save_program` confere `is_super_admin()` **no banco**, porque sessão é
 *    cookie e cookie se edita.
 * 3. A função só alcança `programs`, que não tem dono: esta porta nunca serve
 *    de atalho para mexer no conteúdo de uma academia.
 *
 * A trilha em `platform_access_log` é escrita pela função, não daqui.
 */

function paraNulo(valor: string): string | null {
  const texto = valor.trim()
  return texto === '' ? null : texto
}

export async function salvarProgramaAction(
  _state: ProgramAdminState,
  formData: FormData,
): Promise<ProgramAdminState> {
  await requirePlatformSession()

  try {
    const parsed = saveProgramSchema.safeParse({
      id: formData.get('programId') ?? '',
      code: formData.get('code') ?? '',
      title: formData.get('title') ?? '',
      description: formData.get('description') ?? '',
      durationDays: formData.get('durationDays') ?? '',
      coverUrl: formData.get('coverUrl') ?? '',
      visibility: formData.get('visibility') ?? 'SYNSE_PLUS',
    })

    if (!parsed.success) {
      return {
        status: 'error',
        message: parsed.error.issues[0]?.message ?? 'Revise os campos destacados.',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      }
    }

    const dados = parsed.data
    const dataSource = await getDataSource()
    const programId = await dataSource.saveProgram({
      id: dados.id || undefined,
      code: dados.code,
      title: dados.title,
      description: paraNulo(dados.description),
      durationDays: dados.durationDays,
      coverUrl: paraNulo(dados.coverUrl),
      visibility: dados.visibility,
    })

    logger.info('programa:salvo', { programId, visibility: dados.visibility })
    revalidatePath('/synse-admin/programas')
    revalidatePath(`/synse-admin/programas/${programId}`)
    revalidatePath('/app/programs')

    return { status: 'success', programId, message: 'Programa salvo.' }
  } catch (erro) {
    if (!(erro instanceof AppError)) logger.error('programa:falhou', { erro: String(erro) })
    return { status: 'error', message: toUserMessage(erro) }
  }
}

export async function salvarDiaAction(
  _state: ProgramAdminState,
  formData: FormData,
): Promise<ProgramAdminState> {
  await requirePlatformSession()

  try {
    const parsed = saveProgramStepSchema.safeParse({
      programId: formData.get('programId') ?? '',
      dayNumber: formData.get('dayNumber') ?? '',
      title: formData.get('title') ?? '',
      tasks: formData.get('tasks') ?? '',
    })

    if (!parsed.success) {
      return {
        status: 'error',
        message: parsed.error.issues[0]?.message ?? 'Revise os campos destacados.',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      }
    }

    const dados = parsed.data
    const dataSource = await getDataSource()
    await dataSource.saveProgramStep({
      programId: dados.programId,
      dayNumber: dados.dayNumber,
      title: dados.title,
      tasks: tarefasDoTexto(dados.tasks),
    })

    revalidatePath(`/synse-admin/programas/${dados.programId}`)
    revalidatePath(`/app/programs/${dados.programId}`)

    return { status: 'success', message: `Dia ${dados.dayNumber} salvo.` }
  } catch (erro) {
    if (!(erro instanceof AppError)) logger.error('programa:dia_falhou', { erro: String(erro) })
    return { status: 'error', message: toUserMessage(erro) }
  }
}

export async function apagarProgramaAction(
  _state: ProgramAdminState,
  formData: FormData,
): Promise<ProgramAdminState> {
  await requirePlatformSession()

  try {
    const programId = String(formData.get('programId') ?? '')
    if (!programId) return { status: 'error', message: 'Programa inválido.' }

    const dataSource = await getDataSource()
    await dataSource.deleteProgram(programId)

    logger.info('programa:apagado', { programId })
    revalidatePath('/synse-admin/programas')
    revalidatePath('/app/programs')

    return { status: 'success', message: 'Programa apagado.' }
  } catch (erro) {
    if (!(erro instanceof AppError)) logger.error('programa:apagar_falhou', { erro: String(erro) })
    return { status: 'error', message: toUserMessage(erro) }
  }
}
