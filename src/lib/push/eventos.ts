import 'server-only'

import { createSupabaseAdminClient } from '@/lib/database/supabase-admin'
import { logger } from '@/lib/logger'
import { enviarAviso } from '@/lib/push/send'

/**
 * ── Avisos que saem de um evento, não de um relógio ─────────────────────────
 *
 * Estes acontecem **dentro de uma requisição**: alguém clicou, e a outra
 * pessoa precisa saber. Não dependem de agendador nenhum, e é por isso que
 * existem antes dos lembretes por horário.
 *
 * ── Por que a busca é pela chave de serviço ─────────────────────────────────
 *
 * `request_friendship` devolve **só o id da amizade**, de propósito: nada do
 * perfil alheio vaza para o navegador de quem pediu. Para avisar o
 * destinatário é preciso saber quem ele é — e essa leitura fica no servidor,
 * onde já estava. Mudar a função para devolver o perfil desfaria a decisão da
 * 0037 por conveniência de notificação.
 *
 * ── Falha aqui nunca derruba o que aconteceu ────────────────────────────────
 *
 * A amizade foi pedida; o aviso é acessório. Todo caminho devolve em silêncio.
 */

type Pontas = { requester: string; addressee: string; nomeDeQuemPediu: string }

async function pontasDaAmizade(friendshipId: string): Promise<Pontas | null> {
  const admin = createSupabaseAdminClient()
  if (!admin) return null

  const { data, error } = await admin
    .from('friendships')
    .select('requester_profile_id, addressee_profile_id')
    .eq('id', friendshipId)
    .maybeSingle()

  if (error || !data) return null

  const { data: perfil } = await admin
    .from('user_profiles')
    .select('name')
    .eq('id', data.requester_profile_id as string)
    .maybeSingle()

  return {
    requester: data.requester_profile_id as string,
    addressee: data.addressee_profile_id as string,
    nomeDeQuemPediu: (perfil?.name as string) ?? 'Alguém',
  }
}

/** "Fulano quer treinar com você" — para quem recebeu o pedido. */
export async function avisarPedidoDeAmizade(friendshipId: string): Promise<void> {
  try {
    const pontas = await pontasDaAmizade(friendshipId)
    if (!pontas) return

    await enviarAviso(pontas.addressee, {
      titulo: 'Novo pedido de amizade',
      corpo: `${pontas.nomeDeQuemPediu} quer comparar treinos com você.`,
      url: '/app/friends',
      /*
       * Tag por pessoa, e não por pedido: se a mesma pessoa pedir de novo
       * depois de uma recusa, o aviso substitui o anterior em vez de empilhar.
       */
      tag: 'amizade-pedido',
    })
  } catch (erro) {
    logger.warn('push:aviso_amizade_falhou', { error: String(erro).slice(0, 160) })
  }
}

/** "Fulano aceitou" — para quem pediu, que é quem está esperando. */
export async function avisarAmizadeAceita(friendshipId: string): Promise<void> {
  try {
    const admin = createSupabaseAdminClient()
    const pontas = await pontasDaAmizade(friendshipId)
    if (!admin || !pontas) return

    const { data: quemAceitou } = await admin
      .from('user_profiles')
      .select('name')
      .eq('id', pontas.addressee)
      .maybeSingle()

    await enviarAviso(pontas.requester, {
      titulo: 'Pedido aceito',
      corpo: `${(quemAceitou?.name as string) ?? 'Sua amizade'} aceitou — o ranking já conta vocês dois.`,
      url: '/app/friends',
      tag: 'amizade-aceita',
    })
  } catch (erro) {
    logger.warn('push:aviso_aceite_falhou', { error: String(erro).slice(0, 160) })
  }
}
