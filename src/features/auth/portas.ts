import { isHubRole } from '@/lib/permissions/permissions'
import type { UserRole } from '@/types/domain'

/**
 * A porta para o outro lado da conta.
 *
 * ── O defeito ───────────────────────────────────────────────────────────────
 *
 * Quem administra uma academia e treina nela tem papel de hub em
 * `organization_members` **e** matrícula de aluno. As duas portas abrem para
 * essa pessoa — `requireHubSession` aceita pelo papel, `requireStudentSession`
 * aceita pela matrícula — e nenhuma tela oferecia a passagem. Só funcionava
 * digitando o endereço.
 *
 * O seletor de contexto (`features/platform/context-bar.tsx`) resolve isso
 * para conta de plataforma e começa com `if (!session.isPlatformAccount) return null`.
 * A dona da academia não é conta de plataforma, então ficava de fora.
 *
 * ── O que esta regra não faz ────────────────────────────────────────────────
 *
 * Não concede nada. Ela decide se um **link** aparece; quem decide se a pessoa
 * entra é o portão da rota, que confere papel e matrícula no servidor, e a RLS
 * por baixo. É por isso que a regra pode morar numa função pura: o pior que um
 * erro aqui causa é um link que leva a um redirecionamento.
 */

export type Porta = {
  href: string
  rotulo: string
  detalhe: string
}

/** De qual lado do produto a pessoa está agora. */
export type LadoAtual = 'app' | 'hub'

export function outraPorta(
  session: { role: UserRole; studentId: string | null; isPlatformAccount: boolean },
  lado: LadoAtual,
  organizationName?: string,
): Porta | null {
  /*
   * Conta de plataforma já tem o seletor de contexto, que faz mais do que esta
   * porta: ele entra em qualquer academia. Mostrar as duas coisas lado a lado
   * seria oferecer dois caminhos para o mesmo lugar.
   */
  if (session.isPlatformAccount) return null

  if (lado === 'app') {
    if (!isHubRole(session.role)) return null
    return {
      href: '/dashboard',
      rotulo: 'Painel da academia',
      detalhe: organizationName ?? 'Gestão e operação',
    }
  }

  // No hub: a porta existe se há matrícula, porque é a matrícula que o app
  // exige — não o papel.
  if (!session.studentId) return null
  return {
    href: '/app',
    rotulo: 'Meu treino',
    detalhe: 'Synse App',
  }
}
