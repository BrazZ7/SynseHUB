import { describe, expect, it } from 'vitest'

import { clienteFalso } from '../postgrest-falso'
import { DemoDataSource } from '@/lib/database/demo-data-source'

/**
 * ── "Eu apareço no ranking dos meus amigos?" ────────────────────────────────
 *
 * `friends_ranking` (0037) põe **quem chama** na própria lista sempre — ver o
 * próprio número não é publicação — e só filtra os amigos por consentimento.
 *
 * A tela não sabia disso. Ela dizia "Só aparece quem autorizou — inclusive
 * você" e mostrava a pessoa ranqueada enquanto o cartão de privacidade, na
 * mesma tela, dizia "Sem registro ainda". As duas frases não podiam estar
 * certas, e a errada era a do ranking: quem não autorizou **não** é visto
 * pelos amigos, por mais que se veja ali.
 *
 * ── Por que a pergunta vai ao banco ─────────────────────────────────────────
 *
 * Porque deduzir de `listConsents` dá resposta diferente num caso real.
 * `listConsents` reporta `accepted` da resposta dada à **versão vigente** do
 * documento; `consentiu_ranking` ignora versão e olha a resposta mais recente
 * não revogada. Quem aceitou a v1 continua publicado depois que a v2 entra no
 * ar — e a dedução diria "você está invisível" para alguém cujos números
 * estão na lista dos amigos.
 *
 * Errar tranquilizando é o pior dos dois lados quando o assunto é publicar
 * métrica pessoal, e a regra do projeto sobre isso não tem meio-termo.
 */

describe('apareceNoRanking no Supabase', () => {
  it('pergunta a mesma função que o ranking usa para filtrar os outros', async () => {
    const { dataSource, argsDaRpc } = clienteFalso({
      rpcs: { consentiu_ranking: { data: true, error: null } },
    })

    expect(await dataSource.apareceNoRanking('perfil-1')).toBe(true)
    expect(argsDaRpc('consentiu_ranking')).toEqual({ p_profile_id: 'perfil-1' })
  })

  it('não deduz de `consents`: a resposta vem da função, e só dela', async () => {
    /*
     * A asserção que trava o conserto. Se alguém trocar isto por uma leitura
     * de `consents`, a tela volta a divergir do ranking no caso da versão
     * antiga — que é silencioso e tranquiliza quem não deveria ser
     * tranquilizado.
     */
    const { dataSource, chamadas } = clienteFalso({
      rpcs: { consentiu_ranking: { data: false, error: null } },
    })

    await dataSource.apareceNoRanking('perfil-1')

    expect(chamadas.map((c) => c.nome)).toEqual([])
  })

  it('só `true` é sim — nulo e ausente são não', async () => {
    // `coalesce(..., false)` no SQL; aqui o mesmo, porque uma resposta
    // ausente não é autorização.
    for (const resposta of [null, undefined, false]) {
      const { dataSource } = clienteFalso({
        rpcs: { consentiu_ranking: { data: resposta, error: null } },
      })
      expect(await dataSource.apareceNoRanking('perfil-1')).toBe(false)
    }
  })
})

describe('apareceNoRanking na demonstração', () => {
  it('sem resposta registrada, não aparece', async () => {
    expect(await new DemoDataSource().apareceNoRanking()).toBe(false)
  })

  it('autorizou, aparece', async () => {
    const f = new DemoDataSource([
      { t: 'consent', code: 'RANKING_VISIBILITY', ok: true, at: '2026-10-01T00:00:00Z' },
    ])
    expect(await f.apareceNoRanking()).toBe(true)
  })

  it('desmarcou, não aparece — desmarcado é "fora", não "sem resposta"', async () => {
    const f = new DemoDataSource([
      { t: 'consent', code: 'RANKING_VISIBILITY', ok: true, at: '2026-10-01T00:00:00Z' },
      { t: 'consent', code: 'RANKING_VISIBILITY', ok: false, at: '2026-10-02T00:00:00Z' },
    ])
    expect(await f.apareceNoRanking()).toBe(false)
  })

  it('a demonstração e o ranking dela concordam', async () => {
    /*
     * O controle que impede as duas de divergirem: quem autorizou aparece na
     * própria lista **e** se vê como autorizado; quem não autorizou aparece
     * na própria lista mesmo assim — é essa a assimetria que a tela precisa
     * explicar.
     */
    const semAutorizar = new DemoDataSource()
    const ranking = await semAutorizar.getFriendsRanking(
      new Date(Date.now() - 30 * 86_400_000).toISOString(),
      new Date().toISOString(),
    )

    expect(ranking.some((linha) => linha.souEu), 'eu sempre me vejo').toBe(true)
    expect(await semAutorizar.apareceNoRanking(), 'e mesmo assim não fui publicada').toBe(false)
  })
})
