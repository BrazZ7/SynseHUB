'use server'

import { revalidatePath } from 'next/cache'

import { AVATAR_MAX_BYTES, AVATAR_TIPOS_ACEITOS, type AvatarResult } from '@/features/account/state'
import { requireSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { logger } from '@/lib/logger'

/**
 * Troca a foto de perfil.
 *
 * A validação acontece aqui e não só no navegador: o formulário é editável, e
 * o que chega ao servidor é o que vale. O balde tem os próprios limites por
 * cima, e a política dele confere que o caminho é da pasta de quem subiu.
 *
 * Nenhum `userProfileId` entra por parâmetro — a pessoa sai do `auth.uid()`
 * dentro de `set_profile_avatar`, no banco.
 */
export async function uploadAvatarAction(formData: FormData): Promise<AvatarResult> {
  await requireSession()

  const arquivo = formData.get('foto')
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { status: 'error', message: 'Escolha uma imagem.' }
  }

  if (!AVATAR_TIPOS_ACEITOS.includes(arquivo.type as (typeof AVATAR_TIPOS_ACEITOS)[number])) {
    return { status: 'error', message: 'Use uma imagem JPEG, PNG ou WebP.' }
  }

  if (arquivo.size > AVATAR_MAX_BYTES) {
    return { status: 'error', message: 'A imagem ficou grande demais. Tente outra foto.' }
  }

  try {
    const dataSource = await getDataSource()
    await dataSource.uploadAvatar({
      bytes: await arquivo.arrayBuffer(),
      contentType: arquivo.type,
    })

    revalidatePath('/app/profile')
    return { status: 'success' }
  } catch (erro) {
    logger.error('avatar:upload_falhou', { erro: String(erro) })
    return { status: 'error', message: 'Não foi possível salvar a foto. Tente de novo.' }
  }
}

/** Apaga a foto do balde e do perfil. */
export async function removeAvatarAction(): Promise<AvatarResult> {
  await requireSession()

  try {
    const dataSource = await getDataSource()
    await dataSource.removeAvatar()

    revalidatePath('/app/profile')
    return { status: 'success' }
  } catch (erro) {
    logger.error('avatar:remocao_falhou', { erro: String(erro) })
    return { status: 'error', message: 'Não foi possível remover a foto.' }
  }
}
