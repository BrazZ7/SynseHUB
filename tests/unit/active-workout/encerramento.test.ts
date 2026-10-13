import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { faltaEncerrarNoServidor } from '@/features/active-workout/encerramento'

/**
 * O treino tem de dizer ao servidor que terminou.
 *
 * ── O defeito ───────────────────────────────────────────────────────────────
 *
 * O único lugar da tela que chamava `encerrar('COMPLETED')` era o botão
 * "Concluir treino", dentro do painel de fim de exercício, no ramo "não há
 * próximo exercício". Esse ramo é inalcançável: a última série do último
 * exercício vai direto para WORKOUT_COMPLETED, então EXERCISE_COMPLETED só
 * existe quando há próximo exercício (provado em `engine.test.ts`).
 *
 * `finish_workout_session` nunca era chamada no caminho normal. A sessão ficava
 * `IN_PROGRESS` no servidor até a regra das oito horas (0047) marcá-la como
 * `ABANDONED`, e `listWorkoutSessions` filtra `status = 'COMPLETED'` — o
 * histórico do aluno ficava vazio depois de ele treinar. Nenhum erro, em lugar
 * nenhum.
 */

const sessao = { clientId: 'local-1' }

const encerramento = (sessionClientId: string) => ({
  kind: 'FINISH',
  sessionClientId,
})

describe('falta encerrar no servidor', () => {
  it('com a fila vazia, falta', () => {
    expect(faltaEncerrarNoServidor(sessao, [], false)).toBe(true)
  })

  it('com o encerramento já na fila, não falta', () => {
    /*
     * Ele já foi decidido e está esperando rede. Enfileirar outro gastaria
     * rede para dizer o mesmo — e, pior, poderia dizer outro status.
     */
    expect(faltaEncerrarNoServidor(sessao, [encerramento('local-1')], false)).toBe(false)
  })

  it('o encerramento de outro treino não conta', () => {
    // Fila de aparelho com mais de um treino pendente. Confundir os dois
    // deixaria este treino sem encerrar — o defeito de volta.
    expect(faltaEncerrarNoServidor(sessao, [encerramento('local-9')], false)).toBe(true)
  })

  it('série pendente não é encerramento', () => {
    const fila = [
      { kind: 'SET', sessionClientId: 'local-1' },
      { kind: 'START' },
      { kind: 'UNDO', sessionClientId: 'local-1' },
    ]
    expect(faltaEncerrarNoServidor(sessao, fila, false)).toBe(true)
  })

  it('já encerrado nesta tela, não falta', () => {
    /*
     * O caso que motivou o terceiro argumento: "Encerrar treino" envia
     * `ABANDONED` e mostra o resumo; o "Fechar" do resumo viria em seguida com
     * `COMPLETED`. Como `finish_workout_session` grava o status que recebe, o
     * segundo envio transformaria treino abandonado em treino concluído.
     *
     * A fila não protege sozinha: ela pode já ter esvaziado.
     */
    expect(faltaEncerrarNoServidor(sessao, [], true)).toBe(false)
  })
})

/**
 * A ligação na tela.
 *
 * Teste de texto, e de propósito: o que falhou não foi a lógica, foi o botão
 * apontando para um lugar que nunca aparecia. Renderizar React em teste é algo
 * que este projeto não faz, então a conferência é no código da tela.
 */
describe('o resumo encerra o treino', () => {
  const tela = readFileSync(
    join(process.cwd(), 'src/features/active-workout/active-workout-screen.tsx'),
    'utf8',
  )

  it('o "Fechar" do resumo chama o encerramento, não só a limpeza', () => {
    expect(tela).toMatch(/onFechar=\{\(\) => void treino\.concluirTreino\(\)\}/)
  })

  it('o resumo é o que a tela mostra quando o treino termina', () => {
    // Controle: sem isto, o teste acima poderia passar com um resumo que
    // ninguém renderiza — que é exatamente a forma do defeito original.
    expect(tela).toMatch(/state === 'WORKOUT_COMPLETED'/)
    expect(tela).toMatch(/<Resumo/)
  })

  it('o hook expõe o encerramento que a tela chama', () => {
    const hook = readFileSync(
      join(process.cwd(), 'src/features/active-workout/use-active-workout.ts'),
      'utf8',
    )
    expect(hook).toMatch(/concluirTreino,/)
    expect(hook).toMatch(/kind: 'FINISH'/)
  })
})
