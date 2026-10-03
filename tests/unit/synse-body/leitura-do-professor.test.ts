import { describe, expect, it } from 'vitest'

import { autorizacaoDoAluno } from '@/features/synse-body/state'
import { DemoDataSource } from '@/lib/database/demo-data-source'
import { getDemoDataset } from '@/lib/database/demo-seed'
import type { DemoMutation } from '@/lib/database/demo-journal'
import type { BodyMeasurementShare } from '@/types/domain'

/**
 * ── O outro lado da autorização ─────────────────────────────────────────────
 *
 * A 0032 criou `body_measurement_shares` e a RLS que a respeita; a 0045 deu ao
 * aluno a tela de conceder. `listSharedBodyMeasurements` estava no data source
 * desde o começo e **nenhuma tela a chamava**: o aluno autorizava, a tela dele
 * dizia "autorizado", e no painel do professor não aparecia nada.
 *
 * Metade de um recurso é pior que nenhum, porque a metade que existe promete a
 * que falta. Estes testes guardam as duas coisas que a ligação precisa acertar:
 *
 * 1. **Distinguir "não autorizou" de "autorizou e não pesou".** As duas chegam
 *    como lista vazia, e tratá-las igual faria o professor concluir que o
 *    aluno nunca usou a balança quando é ele quem não pode ver.
 * 2. **Na demonstração, a regra vale igual.** Sem RLS para filtrar, é o data
 *    source de demonstração que precisa recusar — e ele devolvia `[]` fixo,
 *    o que depois da 0045 virou mentira: o visitante autorizava e continuava
 *    sem ver.
 */

const AUTORIZACAO = (parcial: Partial<BodyMeasurementShare> = {}): BodyMeasurementShare => ({
  id: 'share_1',
  userProfileId: 'prof_0001',
  sharedWithProfileId: 'prof_staff_0003',
  sharedWithName: 'Rafael Nunes',
  organizationId: 'org_1',
  grantedAt: '2026-09-01T10:00:00.000Z',
  revokedAt: null,
  ...parcial,
})

describe('a autorização que a ficha do aluno procura', () => {
  it('encontra a do aluno certo para o profissional certo', () => {
    const achada = autorizacaoDoAluno([AUTORIZACAO()], 'prof_0001', 'prof_staff_0003')
    expect(achada?.id).toBe('share_1')
  })

  it('não serve a autorização que outro aluno deu ao mesmo profissional', () => {
    /*
     * O caso que mais importa: um professor autorizado por um aluno não pode
     * ver o corpo de todos os outros. Casar só `sharedWithProfileId` abriria
     * exatamente isso.
     */
    const outra = AUTORIZACAO({ userProfileId: 'prof_0099' })
    expect(autorizacaoDoAluno([outra], 'prof_0001', 'prof_staff_0003')).toBeNull()
  })

  it('não serve a autorização que o aluno deu a outra pessoa', () => {
    const paraOutro = AUTORIZACAO({ sharedWithProfileId: 'prof_staff_0002' })
    expect(autorizacaoDoAluno([paraOutro], 'prof_0001', 'prof_staff_0003')).toBeNull()
  })

  it('revogada não vale', () => {
    const revogada = AUTORIZACAO({ revokedAt: '2026-09-20T10:00:00.000Z' })
    expect(autorizacaoDoAluno([revogada], 'prof_0001', 'prof_staff_0003')).toBeNull()
  })

  it('sem autorização nenhuma, devolve nulo em vez de estourar', () => {
    expect(autorizacaoDoAluno([], 'prof_0001', 'prof_staff_0003')).toBeNull()
  })
})

// ── A demonstração ──────────────────────────────────────────────────────────

/** O diário de quem autorizou o professor Rafael pela tela do app. */
const AUTORIZOU_RAFAEL: DemoMutation[] = [
  { t: 'share', id: 'prof_staff_0003', a: 'grant', nome: 'Rafael Nunes' },
]

const comoRafael = (journal: DemoMutation[] = []) =>
  new DemoDataSource(journal, { perfilAtual: 'prof_staff_0003' })

/** O perfil do aluno que a persona do app representa, lido da própria semente. */
function perfilDoAlunoDoApp(): string {
  const dataset = getDemoDataset()
  const aluno = dataset.students.find((s) => s.id === dataset.studentIdForApp)
  if (!aluno) throw new Error('A semente mudou: o aluno do app sumiu.')
  return aluno.userProfileId
}

describe('a demonstração reproduz a regra, e não uma aproximação', () => {
  it('sem autorização o professor não lê nada', async () => {
    const fonte = comoRafael()
    const perfil = perfilDoAlunoDoApp()
    expect(await fonte.listSharedBodyMeasurements(perfil, '1a')).toEqual([])
  })

  it('depois que o aluno autoriza, o professor lê o histórico', async () => {
    const fonte = comoRafael(AUTORIZOU_RAFAEL)
    const perfil = perfilDoAlunoDoApp()

    const medicoes = await fonte.listSharedBodyMeasurements(perfil, '1a')
    expect(medicoes.length).toBeGreaterThan(0)
    expect(medicoes[0].weightKg).toBeGreaterThan(0)
    // Mais recente primeiro, como a tela desenha.
    expect(medicoes[0].measuredAt >= medicoes[medicoes.length - 1].measuredAt).toBe(true)
  })

  it('a autorização guarda o perfil do aluno, não a matrícula dele', async () => {
    /*
     * Guardava `studentIdForApp`, que é `students.id`. Ninguém notava porque a
     * tela do aluno só lia o nome de quem foi autorizado — o painel do
     * professor casa dono com perfil, e com o id errado a autorização
     * simplesmente não aparecia.
     */
    const fonte = comoRafael(AUTORIZOU_RAFAEL)
    const [autorizacao] = await fonte.listBodyShares()
    expect(autorizacao.userProfileId).toBe(perfilDoAlunoDoApp())
  })

  it('e o professor que o aluno não autorizou continua sem ver', async () => {
    // Mesmo diário, outro perfil olhando: a autorização é nominal.
    const marina = new DemoDataSource(AUTORIZOU_RAFAEL, { perfilAtual: 'prof_staff_0002' })
    const perfil = perfilDoAlunoDoApp()
    expect(await marina.listSharedBodyMeasurements(perfil, '1a')).toEqual([])
  })

  it('autorização revogada fecha de novo', async () => {
    const fonte = comoRafael([
      ...AUTORIZOU_RAFAEL,
      { t: 'share', id: 'prof_staff_0003', a: 'revoke' },
    ])
    const perfil = perfilDoAlunoDoApp()
    expect(await fonte.listSharedBodyMeasurements(perfil, '1a')).toEqual([])
  })

  it('e o histórico de outro aluno não vaza pela autorização deste', async () => {
    const fonte = comoRafael(AUTORIZOU_RAFAEL)
    expect(await fonte.listSharedBodyMeasurements('prof_0099', '1a')).toEqual([])
  })
})
