'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { DEMO_SESSION_COOKIE, findDemoPersona } from '@/lib/auth/session'
import { isDemoMode } from '@/lib/database/env'
import { createSupabaseServerClient } from '@/lib/database/supabase-server'
import { logger } from '@/lib/logger'
import { rateLimit } from '@/lib/rate-limit'
import { credentialsSchema } from '@/lib/validations/auth'

export type AuthActionState = { error?: string }

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
    logger.warn('auth:sign_in_failed', { reason: error.message })
    // Mensagem propositalmente genérica: não revela se o e-mail existe.
    return { error: 'E-mail ou senha incorretos.' }
  }

  redirect('/dashboard')
}

export async function signOut() {
  const cookieStore = await cookies()
  cookieStore.delete(DEMO_SESSION_COOKIE)

  const supabase = await createSupabaseServerClient()
  if (supabase) await supabase.auth.signOut()

  redirect('/login')
}
