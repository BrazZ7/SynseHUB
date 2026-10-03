import 'server-only'

import { APP } from '@/config/app'
import { createSupabaseAdminClient } from '@/lib/database/supabase-admin'
import { logger } from '@/lib/logger'

export type EnvioDoConvite = {
  /** O link é sempre devolvido, tenha o e-mail saído ou não. */
  link: string
  enviado: boolean
  motivo?: 'sem-chave-de-servico' | 'ja-tem-conta' | 'falhou'
}

/**
 * Manda o convite por e-mail, e nunca depende disso.
 *
 * O e-mail sai pelo SMTP do Supabase, que é o único caminho de envio que este
 * projeto já tem configurado — adicionar um provedor de e-mail transacional só
 * para isto seria mais uma conta, mais uma chave e mais uma coisa para expirar.
 *
 * O link volta em todos os casos, e a tela o mostra. Não é plano B
 * improvisado: é como academia no Brasil de fato combina as coisas. Caixa de
 * spam, endereço digitado errado e "não chegou nada" são a regra, e o WhatsApp
 * resolve em quinze segundos. O que não pode é o convite existir e ninguém
 * conseguir alcançá-lo.
 */
export async function enviarConvite(email: string, token: string): Promise<EnvioDoConvite> {
  const link = `${APP.url}/convite/${token}`

  /*
   * O e-mail não aponta direto para o convite: aponta para a rota que troca o
   * código por sessão e só então encaminha. Sem passar por ela, a pessoa cai na
   * página do convite ainda deslogada, e é devolvida para o login — o clique no
   * link não faz nada de útil.
   *
   * Exige que `https://synse.com.br/auth/callback*` esteja na lista de
   * endereços permitidos do Supabase. Sem o curinga, ele recusa o retorno por
   * causa da query e o token nem é consumido.
   */
  const retorno = `${APP.url}/auth/callback?next=${encodeURIComponent(`/convite/${token}`)}`
  const admin = createSupabaseAdminClient()

  if (!admin) return { link, enviado: false, motivo: 'sem-chave-de-servico' }

  const convite = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: retorno })

  if (!convite.error) return { link, enviado: true }

  /*
   * Quem já tem conta no Synse não pode ser "convidado" de novo pelo provedor
   * de autenticação — a chamada falha. Para essa pessoa o certo é um link de
   * acesso comum, que a leva à mesma página de aceite já autenticada.
   */
  const magico = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: retorno },
  })

  if (!magico.error) return { link, enviado: true, motivo: 'ja-tem-conta' }

  logger.warn('staff:invite_mail_failed', {
    erroConvite: convite.error.message,
    erroMagico: magico.error.message,
  })
  return { link, enviado: false, motivo: 'falhou' }
}
