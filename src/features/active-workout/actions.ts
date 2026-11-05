'use server'

import type { RotuloDeEvento } from '@/features/analytics/eventos'
import { requireStudentSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { AppError, toUserMessage } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { workoutFeedbackSchema, workoutPreferencesSchema } from '@/lib/validations/workout'
import type { WorkoutPreferences } from '@/types/domain'

/**
 * As escritas do Treino Ativo.
 *
 * Não usam `useActionState`: quem chama é a fila de sincronização, não um
 * formulário. Cada uma devolve um resultado simples que a fila entende — deu
 * certo, apaga da fila; deu errado, tenta de novo.
 *
 * Nenhuma delas recebe `studentId`. O aluno sai da sessão autenticada, e depois
 * o próprio banco resolve de novo pelo `auth.uid()`. Duas camadas conferindo a
 * mesma coisa não é redundância desperdiçada: a de cima dá mensagem boa, a de
 * baixo é a que não dá para contornar.
 */

export type SyncResult = { ok: true; id?: string } | { ok: false; erro: string }

export async function startWorkoutSessionAction(
  clientId: string,
  workoutPlanId: string | null,
): Promise<SyncResult> {
  try {
    await requireStudentSession()
    const dataSource = await getDataSource()
    const id = await dataSource.startWorkoutSession(clientId, workoutPlanId)
    logger.info('workout:session_started', { sessionId: id })
    /*
     * O evento usa o id da sessão como identificador, e não o `clientId` do
     * aparelho: a sessão é a coisa que começou. Reabrir o mesmo treino —
     * recuperação, reenvio da fila — devolve o mesmo id e não conta um segundo
     * início. É o que mantém honesto o "iniciados versus concluídos".
     */
    await dataSource.registrarEvento({ nome: 'TREINO_INICIADO', clientId: id })
    return { ok: true, id }
  } catch (error) {
    if (!(error instanceof AppError)) logger.error('workout:start_failed', { error: String(error) })
    return { ok: false, erro: toUserMessage(error) }
  }
}

export async function logWorkoutSetAction(input: {
  sessionId: string
  exerciseId: string
  setNumber: number
  repsCompleted: number
  clientId: string
  weight: number | null
  repsPlanned: number | null
  restSeconds: number | null
  startedAt: string | null
  completedAt: string
}): Promise<SyncResult> {
  try {
    await requireStudentSession()
    const dataSource = await getDataSource()
    const id = await dataSource.logWorkoutSet(input)
    // O `clientId` da série: um evento por série, não por toque nem por
    // tentativa da fila.
    await dataSource.registrarEvento({ nome: 'SERIE_CONCLUIDA', clientId: input.clientId })
    return { ok: true, id }
  } catch (error) {
    if (!(error instanceof AppError)) {
      logger.error('workout:log_set_failed', { error: String(error) })
    }
    return { ok: false, erro: toUserMessage(error) }
  }
}

/**
 * Desfaz a série concluída por engano.
 *
 * `ok: true` tanto para a série desfeita agora quanto para a que já não
 * estava lá — a fila reenvia o que não teve resposta, e o resultado é o mesmo
 * dos dois lados: aquela série não existe no servidor. Tratar o reenvio como
 * falha deixaria a operação na fila tentando desfazer para sempre o que já
 * foi desfeito.
 *
 * Quem decide se pode desfazer é `desfazer_serie` (0058): ela confere que o
 * treino é do aluno autenticado e recusa treino já encerrado.
 */
export async function undoWorkoutSetAction(
  sessionId: string,
  serieClientId: string,
): Promise<SyncResult> {
  try {
    await requireStudentSession()
    const dataSource = await getDataSource()
    await dataSource.undoWorkoutSet(sessionId, serieClientId)
    logger.info('workout:set_undone', { sessionId })
    /*
     * O identificador é o da série desfeita: desfazer a mesma série duas vezes
     * — reenvio da fila — é um acontecimento, não dois. Ao lado de
     * SERIE_CONCLUIDA, este evento mede o quanto o toque errado acontece, que é
     * a razão de o desfazer existir.
     */
    await dataSource.registrarEvento({ nome: 'SERIE_DESFEITA', clientId: serieClientId })
    return { ok: true }
  } catch (error) {
    if (!(error instanceof AppError)) logger.error('workout:undo_failed', { error: String(error) })
    return { ok: false, erro: toUserMessage(error) }
  }
}

export async function finishWorkoutSessionAction(
  sessionId: string,
  durationSeconds: number,
  status: 'COMPLETED' | 'ABANDONED',
): Promise<SyncResult> {
  try {
    await requireStudentSession()
    const dataSource = await getDataSource()
    await dataSource.finishWorkoutSession(sessionId, durationSeconds, status)
    logger.info('workout:session_finished', { sessionId, durationSeconds, status })
    /*
     * Só o concluído conta. Treino abandonado é informação diferente — e
     * registrá-lo como concluído faria o indicador que mais importa dizer o
     * contrário do que aconteceu.
     *
     * `valor` é a duração em segundos: é o número que diferencia um treino de
     * uma hora de um toque sem querer em "concluir".
     */
    if (status === 'COMPLETED') {
      await dataSource.registrarEvento({
        nome: 'TREINO_CONCLUIDO',
        clientId: sessionId,
        valor: durationSeconds,
      })
    }
    return { ok: true }
  } catch (error) {
    if (!(error instanceof AppError)) {
      logger.error('workout:finish_failed', { error: String(error) })
    }
    return { ok: false, erro: toUserMessage(error) }
  }
}

/**
 * Como o treino foi, do aluno para o professor.
 *
 * Mesma forma das outras: quem chama é a fila, não um formulário, e o retorno
 * diz só se pode apagar da fila ou tentar de novo.
 *
 * A validação aqui é pela mensagem. Quem recusa de verdade é
 * `set_workout_feedback` (0062), que confere o dono pelo `auth.uid()` e a
 * escala pelo `check` da coluna — e é a camada que não dá para contornar.
 */
export async function enviarFeedbackDoTreinoAction(entrada: {
  sessionId: string
  effort: number
  discomfort: boolean
  note: string | null
}): Promise<SyncResult> {
  try {
    await requireStudentSession()

    const analisado = workoutFeedbackSchema.safeParse(entrada)
    if (!analisado.success) {
      return { ok: false, erro: analisado.error.issues[0]?.message ?? 'Relato inválido.' }
    }

    const dataSource = await getDataSource()
    await dataSource.setWorkoutFeedback({
      sessionId: entrada.sessionId,
      ...analisado.data,
    })
    /*
     * O log guarda o esforço e a marcação de dor, **nunca a observação**: ela
     * é relato de saúde escrito pela pessoa, e log é o lugar errado para isso.
     */
    logger.info('workout:feedback_enviado', {
      sessionId: entrada.sessionId,
      effort: analisado.data.effort,
      discomfort: analisado.data.discomfort,
    })
    return { ok: true }
  } catch (error) {
    if (!(error instanceof AppError)) {
      logger.error('workout:feedback_falhou', { error: String(error) })
    }
    return { ok: false, erro: toUserMessage(error) }
  }
}

/**
 * O treino que ficou no aparelho e chegou depois.
 *
 * Quem sabe disto é a tela, não o servidor: para o banco, um treino que sobe
 * agora é igual a um que subiu no momento em que aconteceu. A recuperação é
 * justamente o caso em que o app foi fechado no meio, a bateria acabou ou a
 * rede faltou — e saber quantas vezes isso acontece é o indicador "falhas e
 * recuperação de sessão".
 */
export async function registrarTreinoRecuperadoAction(sessionClientId: string): Promise<void> {
  try {
    await requireStudentSession()
    const dataSource = await getDataSource()
    await dataSource.registrarEvento({ nome: 'TREINO_RECUPERADO', clientId: sessionClientId })
  } catch (erro) {
    logger.warn('evento:nao_registrado', { nome: 'TREINO_RECUPERADO', erro: String(erro).slice(0, 120) })
  }
}

/**
 * O que a fila desistiu de enviar.
 *
 * O outro lado do indicador acima, e o que dói: estes registros não existem no
 * servidor. O rótulo separa treino inteiro de série solta porque a perda é de
 * tamanhos diferentes, e `valor` diz quantos.
 */
export async function registrarRegistroPerdidoAction(
  clientId: string,
  rotulo: RotuloDeEvento,
  quantos: number,
): Promise<void> {
  try {
    await requireStudentSession()
    const dataSource = await getDataSource()
    await dataSource.registrarEvento({
      nome: 'REGISTRO_PERDIDO',
      clientId,
      rotulo,
      valor: quantos,
    })
  } catch (erro) {
    logger.warn('evento:nao_registrado', { nome: 'REGISTRO_PERDIDO', erro: String(erro).slice(0, 120) })
  }
}

/**
 * As preferências do treino, gravadas no servidor.
 *
 * ── Por que a validação está aqui ──────────────────────────────────────────
 *
 * Esta action recebe um objeto inteiro vindo do cliente. Até ganhar o
 * `safeParse`, ela o entregava ao banco como veio: a única defesa era o
 * `check (default_rest_seconds between 0 and 900)` da 0026 — que recusa, sim,
 * mas devolvendo erro de banco onde deveria haver uma frase, e sem dizer nada
 * sobre os cinco booleanos.
 *
 * `user_profile_id` continua saindo da sessão, nunca do argumento, e a RLS
 * (`workout_preferences_self`, 0026) confere de novo pelo `auth_profile_id()`.
 * O que o esquema acrescenta é a forma — e `analise.data` traz só as chaves
 * declaradas, então campo a mais colado pelo cliente não chega ao `upsert`.
 */
export async function saveWorkoutPreferencesAction(
  preferencias: WorkoutPreferences,
): Promise<SyncResult> {
  try {
    const session = await requireStudentSession()

    const analise = workoutPreferencesSchema.safeParse(preferencias)
    if (!analise.success) {
      throw new AppError(
        'invalid_input',
        'Não reconhecemos estes ajustes de treino.',
        422,
        analise.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      )
    }

    const dataSource = await getDataSource()
    await dataSource.saveWorkoutPreferences(session.userProfileId, analise.data)
    return { ok: true }
  } catch (error) {
    if (!(error instanceof AppError)) {
      logger.error('workout:preferences_failed', { error: String(error) })
    }
    return { ok: false, erro: toUserMessage(error) }
  }
}
