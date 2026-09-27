'use server'

import { revalidatePath } from 'next/cache'

import { SYNSE_ID_RE, type FriendActionState } from '@/features/friends/state'
import { requireStudentSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { isPendingMigration } from '@/lib/database/pending-migration'
import { logger } from '@/lib/logger'
import { avisarAmizadeAceita, avisarPedidoDeAmizade } from '@/lib/push/eventos'
import { rateLimit } from '@/lib/rate-limit'

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

/**
 * Pedidos por minuto, por conta.
 *
 * ── Por que esta ação precisa de limite ─────────────────────────────────────
 *
 * Porque ela responde uma pergunta que ninguém mais responde: "este Synse ID
 * existe?". Acertar devolve "Pedido enviado"; errar devolve "Não encontramos
 * ninguém com esse Synse ID" — e a diferença entre as duas frases é um
 * oráculo de contas.
 *
 * O alfabeto tem 32 símbolos e o id tem 8, então adivinhar às cegas é
 * impraticável. O caso que importa é outro: quem **já tem uma lista** de ids —
 * de uma captura de tela numa aula, de um grupo, de outra academia — e quer
 * saber quais viraram conta no Synse. Sem limite isso custa uma tarde de
 * script.
 *
 * Dez por minuto não atrapalha ninguém: adicionar amigo é coisa de uma vez
 * por semana, e a tela pede o id digitado à mão.
 */
const PEDIDOS_POR_MINUTO = 10

export async function requestFriendshipAction(
  _state: FriendActionState,
  formData: FormData,
): Promise<FriendActionState> {
  const session = await requireStudentSession()

  const synseId = String(formData.get('synseId') ?? '')
    .trim()
    .toUpperCase()

  // A conferência de formato é para dar mensagem boa antes de ir ao banco —
  // quem recusa de verdade é a consulta, que não acha o perfil.
  if (!SYNSE_ID_RE.test(synseId)) {
    return { error: 'O Synse ID tem o formato SYN-XXXXXXXX. Confira e tente de novo.' }
  }

  /*
   * O limite é por quem pede, e vem **depois** da conferência de formato: id
   * malformado nem chega ao banco, então gastar cota com ele deixaria a pessoa
   * de fora por causa dos próprios erros de digitação.
   */
  const limite = rateLimit(`amizade:${session.userProfileId}`, PEDIDOS_POR_MINUTO, 60_000)
  if (!limite.allowed) {
    return { error: 'Muitos pedidos seguidos. Aguarde um minuto e tente de novo.' }
  }

  try {
    const dataSource = await getDataSource()
    const amizadeId = await dataSource.requestFriendship(synseId)
    /*
     * O aviso sai depois de a amizade existir, e nunca antes: avisar de um
     * pedido que falhou seria pior do que não avisar. `avisarPedidoDeAmizade`
     * engole as próprias falhas — o pedido vale mesmo sem o push.
     */
    await avisarPedidoDeAmizade(amizadeId)
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
    /*
     * Só no aceite. Quem foi recusado não recebe aviso de recusa — recusar já
     * é constrangedor de um lado só, e avisar transformaria um silêncio
     * educado numa notificação no bolso da pessoa.
     */
    if (accept) await avisarAmizadeAceita(friendshipId)
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
