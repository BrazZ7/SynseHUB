'use server'

import { rotuloValido, type NomeDeEvento, type RotuloDeEvento } from '@/features/analytics/eventos'
import { requireSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { logger } from '@/lib/logger'

/**
 * A porta de entrada dos eventos que nascem na tela.
 *
 * A maioria dos eventos é registrada no servidor, dentro da action que fez a
 * coisa acontecer — é lá que se sabe que a série **entrou**, e não só que o
 * botão foi tocado. Esta action existe para os que só a tela conhece: abrir um
 * resumo, pedir para compartilhar, confirmar o compartilhamento.
 *
 * `requireSession` e não `requireStudentSession`: quem administra a academia
 * também consulta resumo e compartilha.
 *
 * Nunca estoura. Instrumentação que derruba a tela que ela observa é pior que
 * instrumentação ausente.
 */
export async function registrarEventoAction(
  nome: NomeDeEvento,
  clientId: string,
  rotulo?: RotuloDeEvento | null,
  valor?: number | null,
): Promise<void> {
  try {
    /*
     * O rótulo é conferido aqui, contra o catálogo, antes de ir ao banco: erro
     * de programação aparece como erro de programação, e não como `check
     * constraint` estourando no meio de uma operação.
     */
    if (!rotuloValido(nome, rotulo)) {
      logger.warn('evento:rotulo_invalido', { nome, rotulo: String(rotulo) })
      return
    }

    await requireSession()
    const dataSource = await getDataSource()
    await dataSource.registrarEvento({ nome, clientId, rotulo, valor })
  } catch (erro) {
    logger.warn('evento:nao_registrado', { nome, erro: String(erro).slice(0, 120) })
  }
}
