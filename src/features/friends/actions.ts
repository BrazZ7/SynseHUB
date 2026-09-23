'use server'

import { revalidatePath } from 'next/cache'

import { SYNSE_ID_RE, type FriendActionState } from '@/features/friends/state'
import { requireStudentSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { isPendingMigration } from '@/lib/database/pending-migration'
import { logger } from '@/lib/logger'

/**
 * As escritas de amizade.
 *
 * Cada uma revalida `/app/friends` e nada mais: a lista de amigos não aparece
 * em outra tela, e revalidar o app inteiro para uma linha seria pagar render
 * de tudo por um botão.
 *
 * A autorização é do banco, não daqui. `respond_friendship` recusa quem não é
 * o destinatário, e `remove_friendship` recusa quem não é ponta — conferir
 * aqui também seria duplicar a regra em dois lugares que podem divergir.
 */

function comoErro(erro: unknown, padrao: string): FriendActionState {
  if (isPendingMigration(erro)) {
    logger.warn('amigos:schema_pendente', { detalhe: 'Migration 0037 pendente.' })
    return { error: 'Recurso ainda não disponível. Tente de novo em alguns minutos.' }
  }
  /*
   * A mensagem do banco sobe para a tela porque ela é a resposta útil: "não
   * encontramos ninguém com esse Synse ID" é o que a pessoa precisa ler. Só
   * as mensagens que a 0037 escreve chegam aqui — erro de rede cai no padrão.
   */
  const mensagem = erro instanceof Error ? erro.message : ''
  logger.warn('amigos:falhou', { error: String(erro).slice(0, 200) })
  return { error: mensagem && mensagem.length < 120 ? mensagem : padrao }
}

export async function requestFriendshipAction(
  _state: FriendActionState,
  formData: FormData,
): Promise<FriendActionState> {
  await requireStudentSession()

  const synseId = String(formData.get('synseId') ?? '')
    .trim()
    .toUpperCase()

  // A conferência de formato é para dar mensagem boa antes de ir ao banco —
  // quem recusa de verdade é a consulta, que não acha o perfil.
  if (!SYNSE_ID_RE.test(synseId)) {
    return { error: 'O Synse ID tem o formato SYN-XXXXXXXX. Confira e tente de novo.' }
  }

  try {
    const dataSource = await getDataSource()
    await dataSource.requestFriendship(synseId)
    revalidatePath('/app/friends')
    return { ok: 'Pedido enviado.' }
  } catch (erro) {
    return comoErro(erro, 'Não foi possível enviar o pedido.')
  }
}

export async function respondFriendshipAction(
  _state: FriendActionState,
  formData: FormData,
): Promise<FriendActionState> {
  await requireStudentSession()

  const friendshipId = String(formData.get('friendshipId') ?? '')
  const accept = String(formData.get('accept')) === 'true'
  if (!friendshipId) return { error: 'Pedido não informado.' }

  try {
    const dataSource = await getDataSource()
    await dataSource.respondFriendship(friendshipId, accept)
    revalidatePath('/app/friends')
    return { ok: accept ? 'Agora vocês são amigos.' : 'Pedido recusado.' }
  } catch (erro) {
    return comoErro(erro, 'Não foi possível responder ao pedido.')
  }
}

export async function removeFriendshipAction(
  _state: FriendActionState,
  formData: FormData,
): Promise<FriendActionState> {
  await requireStudentSession()

  const friendshipId = String(formData.get('friendshipId') ?? '')
  if (!friendshipId) return { error: 'Amizade não informada.' }

  try {
    const dataSource = await getDataSource()
    await dataSource.removeFriendship(friendshipId)
    revalidatePath('/app/friends')
    return { ok: 'Amizade desfeita.' }
  } catch (erro) {
    return comoErro(erro, 'Não foi possível desfazer a amizade.')
  }
}
