'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'

import { CONTEXTO_MAX_AGE_SEGUNDOS, type TrocaResult } from '@/features/platform/state'
import { requireSession } from '@/lib/auth/require-session'
import { CONTEXTO_PESSOAL, PLATFORM_CONTEXT_COOKIE } from '@/lib/auth/session'
import { createSupabaseServerClient } from '@/lib/database/supabase-server'
import { logger } from '@/lib/logger'

/**
 * Troca o contexto de uma conta de plataforma.
 *
 * A checagem acontece em dois lugares de propósito. Aqui, para a tela recusar
 * com uma frase em português; e dentro de `log_platform_context`, no banco,
 * que é quem decide de verdade — se esta função tivesse um defeito e deixasse
 * passar, a função do banco ainda recusaria.
 *
 * O cookie é só a lembrança da escolha. Quem monta a sessão consulta o papel
 * no banco a cada requisição, então um cookie apontando para uma academia, na
 * mão de quem não é super admin, não muda absolutamente nada.
 */
export async function trocarContextoAction(destino: string): Promise<TrocaResult> {
  const session = await requireSession()

  if (!session.isPlatformAccount) {
    return { status: 'error', message: 'Esta conta não tem acesso de plataforma.' }
  }

  const pessoal = destino === CONTEXTO_PESSOAL
  if (!pessoal && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(destino)) {
    return { status: 'error', message: 'Destino inválido.' }
  }

  try {
    const supabase = await createSupabaseServerClient()

    /*
     * A trilha é escrita ANTES de o cookie mudar. Falhando a gravação, a troca
     * não acontece — acesso de plataforma sem registro é exatamente o que a
     * 0034 existe para impedir.
     *
     * No modo de demonstração não há Supabase e não há o que registrar: ali
     * ninguém lê dado de ninguém.
     */
    if (supabase) {
      const { error } = await supabase.rpc('log_platform_context', {
        p_organization_id: pessoal ? null : destino,
        p_context: pessoal ? 'PESSOAL' : 'ACADEMIA',
      })
      if (error) {
        logger.error('plataforma:trilha_falhou', { erro: error.message })
        return { status: 'error', message: 'Não foi possível registrar a troca. Nada mudou.' }
      }
    }

    const cookieStore = await cookies()
    cookieStore.set(PLATFORM_CONTEXT_COOKIE, destino, {
      // `httpOnly` porque nenhuma tela precisa ler isto no navegador — e o que
      // o JavaScript não alcança, um script injetado também não.
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: CONTEXTO_MAX_AGE_SEGUNDOS,
    })

    // O layout inteiro muda de contexto: revalidar só a rota atual deixaria a
    // navegação e o cabeçalho mostrando a academia anterior.
    revalidatePath('/', 'layout')
    return { status: 'success', destino, rota: pessoal ? '/app' : '/dashboard' }
  } catch (erro) {
    logger.error('plataforma:troca_falhou', { erro: String(erro) })
    return { status: 'error', message: 'Não foi possível trocar de contexto.' }
  }
}
