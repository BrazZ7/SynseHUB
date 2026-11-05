'use server'

import { revalidatePath } from 'next/cache'

import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { AppError, toUserMessage } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { requirePermission } from '@/lib/permissions/guard'
import { saveContentSchema } from '@/lib/validations/content'
import type { ContentActionState } from '@/features/content/state'

async function staffIdDaSessao(organizationId: string, userProfileId: string) {
  const dataSource = await getDataSource()
  const staff = await dataSource.listStaff(organizationId)
  return staff.find((member) => member.userProfileId === userProfileId)?.id ?? null
}

export async function saveContentAction(
  _state: ContentActionState,
  formData: FormData,
): Promise<ContentActionState> {
  const session = await requireHubSession()

  try {
    requirePermission(session, 'content:write')

    const parsed = saveContentSchema.safeParse({
      type: formData.get('type') ?? 'ARTICLE',
      title: formData.get('title') ?? '',
      summary: formData.get('summary') ?? '',
      body: formData.get('body') ?? '',
      coverUrl: formData.get('coverUrl') ?? '',
      mediaUrl: formData.get('mediaUrl') ?? '',
      pinned: formData.get('pinned') === 'on',
      publishAt: formData.get('publishAt') ?? '',
    })
    if (!parsed.success) {
      return {
        status: 'error',
        message: parsed.error.issues[0]?.message ?? 'Revise os campos destacados.',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      }
    }

    const contentId = String(formData.get('contentId') ?? '')
    const dataSource = await getDataSource()

    if (contentId) {
      const existente = await dataSource.getContent(session.organizationId, contentId)
      if (!existente) return { status: 'error', message: 'Conteúdo não encontrado nesta academia.' }
    }

    const dados = parsed.data
    const item = await dataSource.saveContent({
      id: contentId || undefined,
      organizationId: session.organizationId,
      type: dados.type,
      title: dados.title,
      summary: dados.summary || null,
      body: dados.body || null,
      coverUrl: dados.coverUrl || null,
      mediaUrl: dados.mediaUrl || null,
      pinned: dados.pinned,
      /*
       * Data pura vira o começo do dia. Quem agenda para segunda espera que
       * saia na segunda de manhã, não na madrugada de domingo.
       */
      publishedAt: dados.publishAt ? `${dados.publishAt}T06:00:00` : null,
      authorStaffId: await staffIdDaSessao(session.organizationId, session.userProfileId),
    })

    revalidatePath('/content')
    revalidatePath('/app/content')

    const agendado = item.publishedAt && new Date(item.publishedAt) > new Date()
    return {
      status: 'success',
      message: !item.publishedAt
        ? 'Rascunho salvo. Os alunos ainda não veem.'
        : agendado
          ? 'Agendado. Aparece para os alunos na data marcada.'
          : 'Publicado. Já está no app dos alunos.',
      contentId: item.id,
    }
  } catch (error) {
    if (!(error instanceof AppError)) logger.error('content:save_failed', { error: String(error) })
    return { status: 'error', message: toUserMessage(error) }
  }
}

/** Publica agora o que estava em rascunho. */
export async function publishContentAction(
  _state: ContentActionState,
  formData: FormData,
): Promise<ContentActionState> {
  const session = await requireHubSession()

  try {
    requirePermission(session, 'content:write')
    const contentId = String(formData.get('contentId') ?? '')

    const dataSource = await getDataSource()
    const item = await dataSource.getContent(session.organizationId, contentId)
    if (!item) return { status: 'error', message: 'Conteúdo não encontrado nesta academia.' }

    await dataSource.saveContent({
      id: item.id,
      organizationId: session.organizationId,
      type: item.type,
      title: item.title,
      summary: item.summary,
      body: item.body,
      coverUrl: item.coverUrl,
      mediaUrl: item.mediaUrl,
      pinned: item.pinned,
      publishedAt: new Date().toISOString(),
      authorStaffId: item.authorStaffId,
    })

    revalidatePath('/content')
    revalidatePath('/app/content')
    return { status: 'success', message: 'Publicado. Já está no app dos alunos.' }
  } catch (error) {
    if (!(error instanceof AppError)) {
      logger.error('content:publish_failed', { error: String(error) })
    }
    return { status: 'error', message: toUserMessage(error) }
  }
}

export async function deleteContentAction(
  _state: ContentActionState,
  formData: FormData,
): Promise<ContentActionState> {
  const session = await requireHubSession()

  try {
    requirePermission(session, 'content:write')
    const contentId = String(formData.get('contentId') ?? '')

    const dataSource = await getDataSource()
    const item = await dataSource.getContent(session.organizationId, contentId)
    if (!item) return { status: 'error', message: 'Conteúdo não encontrado nesta academia.' }

    await dataSource.deleteContent(session.organizationId, contentId)
    logger.info('content:deleted', {
      organizationId: session.organizationId,
      contentId,
      actorId: session.userProfileId,
    })

    revalidatePath('/content')
    revalidatePath('/app/content')
    return { status: 'success', message: 'Conteúdo apagado.' }
  } catch (error) {
    if (!(error instanceof AppError)) {
      logger.error('content:delete_failed', { error: String(error) })
    }
    return { status: 'error', message: toUserMessage(error) }
  }
}
