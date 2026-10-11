'use server'

import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { AppError, toUserMessage } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { requirePermission } from '@/lib/permissions/guard'
import { rateLimit } from '@/lib/rate-limit'
import type { AlunoEncontrado, BuscaDeAlunoResultado } from '@/features/students/busca-state'

/**
 * ── Buscar aluno pelo nome, no servidor ─────────────────────────────────────
 *
 * Existe porque cinco telas escolhiam aluno num `<select>` montado a partir de
 * `listStudents`, e **essa lista para em 100** — `Math.min(100, …)` nos dois
 * data sources, e o `pageSize: 300` que algumas pediam não mudava nada. Numa
 * academia com 478 alunos ativos, quatro em cada cinco não existiam para a
 * tela de marcar avaliação, atribuir treino, reservar aula ou prescrever
 * dieta. Sem aviso: o nome simplesmente não estava na lista.
 *
 * Aumentar o teto só adiaria, e carregaria a academia inteira no HTML de toda
 * tela. A busca acontece onde os dados estão.
 *
 * ── O que esta action entrega, e o que não entrega ─────────────────────────
 *
 * Nome, Synse ID e plano — o suficiente para distinguir dois "Ana Gomes" no
 * balcão. Nada de telefone, e-mail, CPF ou situação financeira: é um seletor,
 * não uma lista de alunos, e quem precisa daquilo abre a ficha.
 *
 * Com `workoutPlanId`, entrega também um "já tem este treino" por aluno. A
 * anotação nasce aqui porque é aqui que se sabe **quais** doze alunos a tela
 * mostra: a tela de atribuir treino lia antes a lista inteira de quem tem a
 * ficha, que numa ficha atribuída a todos era a academia inteira no HTML.
 *
 * A academia sai da sessão, nunca do argumento, e a RLS confere por cima.
 */

/** Teto por tela: o seletor mostra os primeiros e pede para refinar. */
const QUANTOS = 12

export async function buscarAlunosAction(
  termo: string,
  somenteAtivos = true,
  /**
   * Opcional: a ficha que a tela está atribuindo. Com ela, cada aluno
   * devolvido vem dizendo se já a tem — a anotação recortada pelos doze da
   * tela, em vez da lista inteira de quem tem a ficha viajando ao navegador.
   *
   * O id vem do cliente e não é segredo: está na URL da própria tela. O que
   * protege é a academia, que sai da sessão, e a RLS por cima.
   */
  workoutPlanId?: string,
): Promise<BuscaDeAlunoResultado> {
  const session = await requireHubSession()

  try {
    requirePermission(session, 'students:read')
    // A anotação é dado de treino, e por isso pede a permissão de treino:
    // `students:read` sozinho não dá direito de saber quem tem qual ficha.
    if (workoutPlanId) requirePermission(session, 'workouts:read')

    /*
     * A tela adia a digitação antes de chamar, então o limite não é para o
     * uso normal — é para a aba deixada aberta num laço, ou para quem
     * descobriu a action e resolveu varrer o cadastro por força bruta. Com
     * 120 por minuto, a recepção não encosta nele nem digitando sem parar.
     */
    const limite = await rateLimit(`busca-aluno:${session.userProfileId}`, 120, 60_000)
    if (!limite.allowed) {
      return { ok: false, erro: 'Muitas buscas seguidas. Aguarde um instante.' }
    }

    const procurado = termo.trim().slice(0, 80)
    const dataSource = await getDataSource()

    const pagina = await dataSource.listStudents(session.organizationId, {
      search: procurado || undefined,
      status: somenteAtivos ? 'ACTIVE' : 'ALL',
      page: 1,
      pageSize: QUANTOS,
    })

    /*
     * Quem, entre estes, já tem a ficha. A pergunta leva os ids da página —
     * no máximo `QUANTOS` —, então a resposta tem o mesmo teto da tela, e não
     * o tamanho da academia.
     */
    const comOTreino =
      workoutPlanId && pagina.rows.length
        ? new Set(
            (
              await dataSource.listAssignmentsForPlan(
                session.organizationId,
                workoutPlanId,
                pagina.rows.map((aluno) => aluno.id),
              )
            ).map((atribuicao) => atribuicao.studentId),
          )
        : null

    const alunos: AlunoEncontrado[] = pagina.rows.map((aluno) => ({
      id: aluno.id,
      name: aluno.name,
      synseId: aluno.synseId,
      planName: aluno.planName,
      ...(comOTreino ? { jaTemOTreino: comOTreino.has(aluno.id) } : {}),
    }))

    /*
     * `total` é quantos casam com a busca, não quantos vieram. É o que deixa
     * a tela dizer "mostrando 12 de 83" em vez de fingir que são todos — o
     * silêncio sobre o corte foi exatamente o defeito do `<select>`.
     */
    return { ok: true, alunos, total: pagina.total }
  } catch (error) {
    if (!(error instanceof AppError)) {
      logger.error('students:search_failed', { error: String(error) })
    }
    return { ok: false, erro: toUserMessage(error) }
  }
}
