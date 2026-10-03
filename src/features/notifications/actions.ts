'use server'

import { revalidatePath } from 'next/cache'

import { requireSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { logger } from '@/lib/logger'

/**
 * Marca como lidos os avisos de quem está autenticado.
 *
 * Não recebe ids do cliente de propósito: no Supabase a função no banco resolve
 * o perfil pelo próprio JWT, então não existe forma de pedir para marcar o
 * aviso de outra pessoa.
 */
export async function markNotificationsReadAction(): Promise<void> {
  const session = await requireSession()

  try {
    const dataSource = await getDataSource()
    const marked = await dataSource.markNotificationsRead(session.userProfileId)
    logger.info('notifications:read', { marked })
  } catch (error) {
    logger.warn('notifications:mark_failed', { error: String(error).slice(0, 200) })
  }

  // O sino vive no layout: revalidar só a rota atual deixaria o contador
  // desatualizado na navegação seguinte.
  revalidatePath('/', 'layout')
}
