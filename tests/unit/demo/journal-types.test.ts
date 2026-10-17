import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { TIPOS_DE_MUTACAO } from '@/lib/database/demo-journal'

/**
 * ── A lista que parou no tempo ───────────────────────────────────────────────
 *
 * O diário da demonstração confere o `t` de cada alteração antes de aceitá-la
 * de volta do cookie. Essa conferência era uma lista escrita à mão, e enquanto
 * novos tipos entravam na união — treino montado, treino atribuído, aluno
 * editado, situação de matrícula, consentimento —, a lista continuava com os
 * sete originais.
 *
 * O defeito era silencioso: gravava, engordava o cookie, e a leitura seguinte
 * descartava. Na demonstração, montar um treino mostrava "criado com sucesso"
 * e o treino não aparecia em lugar nenhum.
 *
 * O `Record` sobre a união já faz o compilador reclamar de tipo faltando. Este
 * teste fecha o outro lado: garante que nada foi acrescentado ao filtro sem
 * existir na união, e que a contagem bate com o que está declarado no arquivo.
 */
describe('os tipos do diário da demonstração', () => {
  it('cobre toda a união declarada no arquivo', () => {
    const fonte = readFileSync(
      join(process.cwd(), 'src/lib/database/demo-journal.ts'),
      'utf8',
    )

    const naUniao = [...fonte.matchAll(/^ {6}t: '([a-z]+)'/gm)].map((m) => m[1]).sort()

    expect(naUniao.length).toBeGreaterThan(7)
    expect([...TIPOS_DE_MUTACAO].sort()).toEqual(naUniao)
  })

  it('inclui os tipos que faltavam e sumiam em silêncio', () => {
    for (const tipo of ['wplan', 'wedit', 'wassign', 'sedit', 'sstatus', 'consent']) {
      expect(TIPOS_DE_MUTACAO).toContain(tipo)
    }
  })
})
