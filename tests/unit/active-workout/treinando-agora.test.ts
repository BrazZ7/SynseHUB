import { describe, expect, it } from 'vitest'

import { haQuantoTempo } from '@/features/checkin/state'
import { DemoDataSource } from '@/lib/database/demo-data-source'
import type { DemoMutation } from '@/lib/database/demo-journal'
import { DEMO_ORG_ID } from '@/lib/database/demo-seed'

/**
 * ── Quem está treinando agora ───────────────────────────────────────────────
 *
 * `workout_sessions` registra cada treino desde a 0026 e a academia não tinha
 * onde ver nenhum em andamento. O check-in diz quem **entrou**; isto diz quem
 * está no salão com o treino aberto, e não é a mesma pessoa.
 *
 * ── A janela de oito horas ──────────────────────────────────────────────────
 *
 * É o que separa "agora" de "nunca foi fechado". Sessão fica pendurada com
 * facilidade — app morto, bateria acabada, fila offline que desistiu do
 * FINISH —, e sem o corte o painel mostraria alguém que foi embora na semana
 * passada como se estivesse no supino.
 *
 * O corte existe em três lugares, de propósito, e os três estão nos testes:
 * na 0047 (que fecha a sessão de verdade), na consulta de produção e aqui no
 * data source de demonstração. A migration só age quando o aluno abre o
 * próximo treino; quem nunca mais voltou continua pendurado até lá.
 */

describe('há quanto tempo essa pessoa está treinando', () => {
  const AGORA = new Date('2026-10-03T15:00:00.000Z').getTime()
  const atras = (minutos: number) => new Date(AGORA - minutos * 60_000).toISOString()

  it('menos de um minuto é "agora mesmo", e não "há 0 min"', () => {
    expect(haQuantoTempo(atras(0), AGORA)).toBe('agora mesmo')
    expect(haQuantoTempo(atras(0.5), AGORA)).toBe('agora mesmo')
  })

  it('abaixo de uma hora, minutos', () => {
    expect(haQuantoTempo(atras(1), AGORA)).toBe('há 1 min')
    expect(haQuantoTempo(atras(23), AGORA)).toBe('há 23 min')
    expect(haQuantoTempo(atras(59), AGORA)).toBe('há 59 min')
  })

  it('acima de uma hora, horas e minutos com dois dígitos', () => {
    // "1h5" se lê como uma hora e cinco, ou uma hora e cinquenta? O zero
    // resolve antes de alguém precisar perguntar.
    expect(haQuantoTempo(atras(60), AGORA)).toBe('há 1h')
    expect(haQuantoTempo(atras(65), AGORA)).toBe('há 1h05')
    expect(haQuantoTempo(atras(72), AGORA)).toBe('há 1h12')
    expect(haQuantoTempo(atras(125), AGORA)).toBe('há 2h05')
  })

  it('relógio do servidor adiantado não produz tempo negativo', () => {
    /*
     * O `started_at` vem do banco e o `agora` do processo que renderiza. Os
     * dois relógios não são o mesmo, e "há -2 min" na tela é o tipo de coisa
     * que faz alguém duvidar do painel inteiro.
     */
    expect(haQuantoTempo(atras(-5), AGORA)).toBe('agora mesmo')
  })
})

describe('o painel na demonstração', () => {
  it('sem ninguém treinando, devolve lista vazia em vez de inventar', async () => {
    /*
     * A semente não produz treino em andamento, e inventar um mostraria gente
     * treinando numa academia onde ninguém abriu o app. O painel vazio é a
     * verdade aqui, e a tela explica isso.
     */
    const fonte = new DemoDataSource([])
    expect(await fonte.listActiveWorkoutSessions(DEMO_ORG_ID)).toEqual([])
  })

  it('quem abriu um treino aparece, com o nome e o tempo', async () => {
    const fonte = new DemoDataSource([])
    await fonte.startWorkoutSession('c-agora', null)

    const [treinando] = await fonte.listActiveWorkoutSessions(DEMO_ORG_ID)
    expect(treinando).toBeDefined()
    expect(treinando.studentName).not.toBe('Aluno') // o nome veio do cadastro
    expect(treinando.status).toBe('IN_PROGRESS')
    expect(treinando.totalSets).toBe(0)
  })

  it('e a academia vizinha não vê esse treino', async () => {
    /*
     * A primeira versão deste teste pedia a lista de outra academia numa
     * instância sem treino nenhum — devolvia vazio por não haver dado, não
     * por filtrar. Conferido por mutação: tirar o `organizationId` do filtro
     * não derrubava nada. Agora existe um treino aberto para ele esconder.
     */
    const fonte = new DemoDataSource([])
    await fonte.startWorkoutSession('c-agora', null)

    expect(await fonte.listActiveWorkoutSessions(DEMO_ORG_ID)).toHaveLength(1)
    expect(await fonte.listActiveWorkoutSessions('org_vizinha')).toEqual([])
  })

  it('o treino sobrevive à troca de persona, que é como a demonstração é usada', async () => {
    /*
     * O visitante abre o Treino Ativo como aluno e troca para a recepção para
     * ver o painel. São duas requisições, e o data source é remontado em cada
     * uma: sem o diário, a sessão morria entre elas e o painel ficava
     * eternamente vazio — a tela nova pareceria a tela quebrada.
     */
    const diario: DemoMutation[] = [
      { t: 'wsess', a: 'start', id: 'wsess_demo', plano: null, at: new Date().toISOString() },
      { t: 'wsess', a: 'set' },
      { t: 'wsess', a: 'set' },
    ]
    const naRecepcao = new DemoDataSource(diario)

    const [treinando] = await naRecepcao.listActiveWorkoutSessions(DEMO_ORG_ID)
    expect(treinando).toBeDefined()
    expect(treinando.totalSets).toBe(2)
  })

  it('e some do painel quando o treino termina', async () => {
    const depoisDeEncerrar = new DemoDataSource([
      { t: 'wsess', a: 'start', id: 'wsess_demo', plano: null, at: new Date().toISOString() },
      { t: 'wsess', a: 'set' },
      { t: 'wsess', a: 'finish' },
    ])
    expect(await depoisDeEncerrar.listActiveWorkoutSessions(DEMO_ORG_ID)).toEqual([])
  })

  it('e o treino de ontem que ninguém fechou fica fora', async () => {
    /*
     * A janela de oito horas. Sem ela o painel mostraria para sempre quem
     * esqueceu o app aberto — e é exatamente o que a 0047 existe para evitar
     * do lado do banco.
     */
    const fonte = new DemoDataSource([])
    const id = await fonte.startWorkoutSession('c-ontem', null)
    const sessoes = await fonte.listActiveWorkoutSessions(DEMO_ORG_ID)
    expect(sessoes.map((s) => s.sessionId)).toContain(id)

    // Envelhece a sessão para além da janela.
    const guardadas = (fonte as unknown as { demoWorkoutSessions: { startedAt: string }[] })
      .demoWorkoutSessions
    guardadas[0].startedAt = new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString()

    expect(await fonte.listActiveWorkoutSessions(DEMO_ORG_ID)).toEqual([])
  })
})

describe('o toque duplo na demonstração', () => {
  /*
   * O banco tem `unique (session_id, client_id)` (0026) e a demonstração
   * precisa da mesma garantia — senão ela ensina um comportamento que o
   * produto não tem.
   *
   * A versão anterior comparava `${sessionId}:${clientId}` com
   * `${sessionId}:${índice}`: um identificador contra uma posição de array.
   * Nunca deduplicava. Apareceu no painel "Treinando agora", que mostrou
   * "2 séries" depois de um toque só — encontrado no navegador, não aqui.
   */
  const SERIE = {
    exerciseId: 'exr_0001',
    setNumber: 1,
    repsCompleted: 10,
    weight: 40,
    repsPlanned: 10,
    restSeconds: 60,
    startedAt: null,
    completedAt: new Date().toISOString(),
  }

  it('a mesma série enviada duas vezes conta uma', async () => {
    const fonte = new DemoDataSource([])
    const sessionId = await fonte.startWorkoutSession('c-toque', null)

    await fonte.logWorkoutSet({ ...SERIE, sessionId, clientId: 'serie-1' })
    await fonte.logWorkoutSet({ ...SERIE, sessionId, clientId: 'serie-1' })

    const [treinando] = await fonte.listActiveWorkoutSessions(DEMO_ORG_ID)
    expect(treinando.totalSets).toBe(1)
  })

  it('e duas séries diferentes contam duas', async () => {
    // O controle: a correção não pode engolir a série seguinte.
    const fonte = new DemoDataSource([])
    const sessionId = await fonte.startWorkoutSession('c-duas', null)

    await fonte.logWorkoutSet({ ...SERIE, sessionId, clientId: 'serie-1' })
    await fonte.logWorkoutSet({ ...SERIE, sessionId, setNumber: 2, clientId: 'serie-2' })

    const [treinando] = await fonte.listActiveWorkoutSessions(DEMO_ORG_ID)
    expect(treinando.totalSets).toBe(2)
  })
})
