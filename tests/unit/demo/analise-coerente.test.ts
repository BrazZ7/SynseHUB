import { describe, expect, it } from 'vitest'

import { DemoDataSource } from '@/lib/database/demo-data-source'

/**
 * ── Dois números da mesma tela discordando ──────────────────────────────────
 *
 * A análise mostrava "5 treinos" e "0 treinos por semana" lado a lado, na
 * demonstração. Não era erro de conta: `getWorkoutTotals` lê o histórico
 * achatado que a semente produz (`workout_logs`), e a constância lia
 * `listWorkoutSessions`, que só ganha linha depois de alguém treinar pelo
 * Treino Ativo — e ninguém treina antes de abrir a tela.
 *
 * Em produção as duas leituras saem de `workout_sessions` e concordam
 * sozinhas. O remendo é só da demonstração, e este teste é o que impede a
 * demonstração de voltar a se contradizer.
 *
 * Achei olhando a tela, não lendo o código. Vale registrar: o motor estava
 * certo e testado, e o defeito estava na costura entre ele e o dataset.
 */
describe('a demonstração não se contradiz na análise', () => {
  const fonte = new DemoDataSource([])
  const DIA = 86_400_000

  /*
   * A semente dá histórico de treino aos vinte primeiros alunos, e é
   * determinística — os mesmos ids em qualquer máquina. Percorrer a listagem
   * para "achar um com treino" não encontraria: ela vem ordenada por outro
   * critério, e os vinte ficam fora das primeiras páginas.
   */
  const COM_HISTORICO = ['stu_0001', 'stu_0002', 'stu_0003']

  it('todo aluno com treino no período aparece nas duas leituras', async () => {
    const ate = new Date()
    const de = new Date(ate.getTime() - 365 * DIA)

    let conferidos = 0
    for (const alunoId of COM_HISTORICO) {
      const totais = await fonte.getWorkoutTotals(alunoId, de.toISOString(), ate.toISOString())
      if (totais.workouts === 0) continue
      conferidos += 1

      const sessoes = await fonte.listWorkoutSessions(alunoId, 500)
      const naJanela = sessoes.filter((sessao) => {
        const quando = Date.parse(sessao.startedAt)
        return quando >= de.getTime() && quando <= ate.getTime()
      })

      // O defeito: `naJanela` vinha zerado enquanto `totais.workouts` contava 5.
      expect(naJanela.length, `aluno ${alunoId}`).toBe(totais.workouts)
    }

    // Sem nenhum aluno com treino o laço acima não afirma nada, e um teste que
    // não afirma nada passa verde para sempre.
    expect(conferidos, 'a semente deixou de ter histórico de treino').toBeGreaterThan(0)
  })

  it('a sessão sintética carrega o volume do histórico', async () => {
    const ate = new Date()
    const de = new Date(ate.getTime() - 365 * DIA)

    const totais = await fonte.getWorkoutTotals('stu_0001', de.toISOString(), ate.toISOString())
    const sessoes = await fonte.listWorkoutSessions('stu_0001', 500)
    const somaDasSessoes = sessoes.reduce((total, sessao) => total + sessao.totalSets, 0)
    expect(somaDasSessoes).toBe(totais.sets)
  })

  it('não inventa sessão para aluno sem histórico', async () => {
    const sessoes = await fonte.listWorkoutSessions('aluno-que-nao-existe', 200)
    expect(sessoes).toEqual([])
  })
})
