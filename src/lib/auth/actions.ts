'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { DEMO_SESSION_COOKIE, findDemoPersona } from '@/lib/auth/session'
import { isDemoMode } from '@/lib/database/env'
import { createSupabaseServerClient } from '@/lib/database/supabase-server'
import { logger } from '@/lib/logger'
import { rateLimit } from '@/lib/rate-limit'
import { credentialsSchema, emailLinkSchema, signUpSchema } from '@/lib/validations/auth'
import { parseAccountType } from '@/features/auth/account-type'
import { APP } from '@/config/app'

export type AuthActionState = { error?: string; sent?: boolean }

const SESSION_MAX_AGE = 60 * 60 * 8 // 8 horas

/** Entrada em DEMO MODE: escolhe uma persona, sem senha. */
export async function signInWithDemoPersona(personaKey: string) {
  if (!isDemoMode()) return { error: 'O modo de demonstração está desativado neste ambiente.' }

  const persona = findDemoPersona(personaKey)
  if (!persona) return { error: 'Perfil de demonstração não encontrado.' }

  const cookieStore = await cookies()
  cookieStore.set(DEMO_SESSION_COOKIE, persona.key, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  })

  redirect(persona.role === 'STUDENT' ? '/app' : '/dashboard')
}

export async function signInWithPassword(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!parsed.success) {
    return { error: 'Informe um e-mail válido e a sua senha.' }
  }

  // Proteção contra força bruta e enumeração de contas.
  const limit = rateLimit(`login:${parsed.data.email.toLowerCase()}`, 5, 60_000)
  if (!limit.allowed) {
    return { error: 'Muitas tentativas. Aguarde um minuto e tente novamente.' }
  }

  const supabase = await createSupabaseServerClient()
  if (!supabase) {
    return { error: 'Autenticação indisponível neste ambiente. Use uma conta de demonstração.' }
  }

  const { error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error) {
    logger.warn('auth:sign_in_failed', {
      reason: error.message,
      code: error.code,
      status: error.status,
    })

    /*
     * `email_not_confirmed` pode ser dito em voz alta.
     *
     * O GoTrue confere a senha antes de olhar a confirmação: esse código só
     * aparece quando a senha está certa. Quem o recebe já provou que a conta é
     * dele, então a mensagem não revela nada a mais — e sem ela a pessoa fica
     * tentando de novo com a senha correta, lendo "senha incorreta".
     */
    if (error.code === 'email_not_confirmed') {
      return {
        error: 'Confirme seu e-mail antes de entrar. Use "Entrar com link por e-mail" abaixo.',
      }
    }

    if (error.code === 'over_request_rate_limit' || error.status === 429) {
      return { error: 'Muitas tentativas. Aguarde um minuto e tente novamente.' }
    }

    /*
     * Falha de infraestrutura não é senha errada.
     *
     * Uma chave do Supabase vencida ou de outro projeto responde 401, e o
     * projeto pausado responde 5xx. Chamar isso de "senha incorreta" manda
     * todo mundo procurar no lugar errado — foi o que aconteceu aqui, com uma
     * build antiga no ar carregando a chave antiga embutida. A frase não
     * revela nada sobre a conta, e o log sobe para `error`.
     */
    const infra = error.status === 401 || error.status === 403 || (error.status ?? 0) >= 500
    if (infra) {
      logger.error('auth:sign_in_unavailable', {
        reason: error.message,
        code: error.code,
        status: error.status,
      })
      return { error: 'A autenticação está indisponível no momento. Tente novamente em instantes.' }
    }

    // Genérica de propósito nos demais casos: não revela se o e-mail existe.
    return { error: 'E-mail ou senha incorretos.' }
  }

  redirect('/dashboard')
}

/**
 * Entrada por link enviado no e-mail (Supabase Auth OTP).
 *
 * É o caminho das contas criadas pelo seed, que nascem sem senha — assim não
 * existe credencial fixa no repositório nem no banco.
 *
 * `shouldCreateUser: false` é deliberado: sem isso qualquer pessoa criaria uma
 * conta digitando um e-mail nesta tela. Quem entra é quem já foi cadastrado.
 */
export async function signInWithEmailLink(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = emailLinkSchema.safeParse({ email: formData.get('email') })
  if (!parsed.success) return { error: 'Informe um e-mail válido.' }

  const limit = rateLimit(`magiclink:${parsed.data.email.toLowerCase()}`, 3, 300_000)
  if (!limit.allowed) {
    return { error: 'Já enviamos um link há pouco. Confira sua caixa de entrada.' }
  }

  const supabase = await createSupabaseServerClient()
  if (!supabase) {
    return { error: 'Autenticação indisponível neste ambiente. Use uma conta de demonstração.' }
  }

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { shouldCreateUser: false, emailRedirectTo: `${APP.url}/auth/callback` },
  })

  if (error) logger.warn('auth:magic_link_failed', { reason: error.message })

  // Resposta idêntica com ou sem erro: não revela quais e-mails existem.
  return { sent: true }
}

/**
 * Criação de conta.
 *
 * Não cria academia aqui: com confirmação de e-mail ligada não existe sessão
 * até a pessoa clicar no link, e a função de cadastro exige `auth.uid()`.
 * A academia nasce depois, no onboarding, já autenticada.
 */
export async function signUpWithPassword(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = signUpSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Confira os dados informados.' }
  }

  const limit = rateLimit(`signup:${parsed.data.email}`, 3, 600_000)
  if (!limit.allowed) {
    return { error: 'Muitas tentativas de cadastro. Aguarde alguns minutos.' }
  }

  const supabase = await createSupabaseServerClient()
  if (!supabase) {
    return { error: 'Cadastro indisponível neste ambiente.' }
  }

  /*
   * O perfil escolhido viaja nos metadados da conta, não na URL de retorno.
   *
   * A etapa seguinte depende dele — dados do negócio para academia e
   * profissional, código de convite para aluno — e entre uma coisa e outra a
   * pessoa sai do site para abrir a caixa de entrada.
   *
   * A URL de retorno fica sem query string de propósito: o Supabase compara o
   * endereço inteiro contra a lista de permitidos, e qualquer parâmetro extra
   * faz o retorno ser recusado — o token não é consumido e o clique no link de
   * confirmação simplesmente não faz nada, sem erro visível. Já aconteceu.
   */
  const tipo = parseAccountType(formData.get('accountType')?.toString()) ?? 'academia'

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { name: parsed.data.name, accountType: tipo },
      emailRedirectTo: `${APP.url}/auth/callback`,
    },
  })

  if (error) {
    logger.warn('auth:sign_up_failed', { reason: error.message })
    // Genérica de propósito: não revela quais e-mails já têm conta.
    return { sent: true }
  }

  // Com confirmação de e-mail ligada não vem sessão; a pessoa precisa do link.
  if (!data.session) return { sent: true }

  redirect(`/onboarding?tipo=${tipo}`)
}

export async function signOut() {
  const cookieStore = await cookies()
  cookieStore.delete(DEMO_SESSION_COOKIE)

  const supabase = await createSupabaseServerClient()
  if (supabase) await supabase.auth.signOut()

  redirect('/login')
}
