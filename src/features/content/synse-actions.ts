'use server'

import { revalidatePath } from 'next/cache'

import { requirePlatformSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { AppError, toUserMessage } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { saveSynseContentSchema } from '@/lib/validations/content'
import type { ContentActionState } from '@/features/content/state'

/**
 * ── Publicar no acervo Synse ─────────────────────────────────────────────────
 *
 * Conteúdo **sem dono**, que vai para toda a base — não para uma academia. É a
 * ação de maior alcance do sistema, e por isso tem três travas em série, cada
 * uma independente da anterior:
 *
 * 1. `requirePlatformSession` — a rota inteira é de conta de plataforma.
 * 2. `save_synse_content` confere `is_super_admin()` **no banco**, porque
 *    sessão é cookie e cookie se edita.
 * 3. A função só alcança linha sem dono, então esta porta nunca serve de
 *    atalho para editar o conteúdo de uma academia.
 *
 * A trilha em `platform_access_log` é escrita pela função, não daqui: registro
 * que depende da aplicação lembrar de chamar é registro que um dia falta.
 */

function paraNulo(valor: FormDataEntryValue | null): string | null {
  const texto = String(valor ?? '').trim()
  return texto === '' ? null : texto
}

export async function saveSynseContentAction(
  _state: ContentActionState,
  formData: FormData,
): Promise<ContentActionState> {
  await requirePlatformSession()

  try {
    const parsed = saveSynseContentSchema.safeParse({
      id: formData.get('contentId') ?? '',
      type: formData.get('type') ?? 'EBOOK',
      title: formData.get('title') ?? '',
      summary: formData.get('summary') ?? '',
      body: formData.get('body') ?? '',
      coverUrl: formData.get('coverUrl') ?? '',
      mediaUrl: formData.get('mediaUrl') ?? '',
      visibility: formData.get('visibility') ?? 'SYNSE_PLUS',
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

    const dados = parsed.data
    const dataSource = await getDataSource()

    const contentId = await dataSource.saveSynseContent({
      id: dados.id || undefined,
      type: dados.type,
      title: dados.title,
      summary: paraNulo(dados.summary),
      body: paraNulo(dados.body),
      coverUrl: paraNulo(dados.coverUrl),
      mediaUrl: paraNulo(dados.mediaUrl),
      visibility: dados.visibility,
      pinned: dados.pinned,
      /*
       * Data em branco é rascunho, e é o padrão de propósito: publicar para
       * toda a base não pode ser o que acontece quando a pessoa só queria
       * salvar o que escreveu até agora.
       */
      publishedAt: dados.publishAt ? new Date(`${dados.publishAt}T12:00:00`).toISOString() : null,
    })

    logger.info('acervo:salvo', { contentId, visibility: dados.visibility })
    revalidatePath('/synse-admin/acervo')

    return {
      status: 'success',
      contentId,
      message: dados.publishAt ? 'Publicado no acervo.' : 'Rascunho salvo.',
    }
  } catch (error) {
    if (!(error instanceof AppError)) logger.error('acervo:falhou', { error: String(error) })
    return { status: 'error', message: toUserMessage(error) }
  }
}

export async function deleteSynseContentAction(
  _state: ContentActionState,
  formData: FormData,
): Promise<ContentActionState> {
  await requirePlatformSession()

  try {
    const contentId = String(formData.get('contentId') ?? '')
    if (!contentId) return { status: 'error', message: 'Item inválido.' }

    const dataSource = await getDataSource()
    await dataSource.deleteSynseContent(contentId)

    logger.info('acervo:apagado', { contentId })
    revalidatePath('/synse-admin/acervo')

    return { status: 'success', message: 'Item removido do acervo.' }
  } catch (error) {
    if (!(error instanceof AppError)) logger.error('acervo:apagar_falhou', { error: String(error) })
    return { status: 'error', message: toUserMessage(error) }
  }
}
