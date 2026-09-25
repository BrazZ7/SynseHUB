import { describe, expect, it } from 'vitest'

import { saveSynseContentSchema } from '@/lib/validations/content'

/**
 * ── Identificador, e não UUID ────────────────────────────────────────────────
 *
 * `validations/workout.ts` já carrega esta lição, escrita depois de `uuid()`
 * quebrar a montagem de treino inteira no modo de demonstração — onde os ids
 * são legíveis, `exr_0018` e `acv_2`, e não UUIDs.
 *
 * O schema do acervo repetiu o erro, e o sintoma foi o mesmo: clicar em
 * "Editar", corrigir o título e receber **"Invalid uuid"**. Pior tipo de erro,
 * o que acusa quem fez tudo certo. Encontrado medindo a tela no navegador, não
 * lendo o código.
 *
 * Este teste existe para a lição não precisar ser aprendida uma terceira vez.
 */
describe('id do acervo', () => {
  const base = { type: 'EBOOK' as const, title: 'Um título qualquer' }

  it('aceita o identificador legível do modo de demonstração', () => {
    const r = saveSynseContentSchema.safeParse({ ...base, id: 'acv_2' })
    expect(r.success).toBe(true)
  })

  it('aceita o UUID da produção', () => {
    const r = saveSynseContentSchema.safeParse({
      ...base,
      id: '11111111-1111-1111-1111-111111111111',
    })
    expect(r.success).toBe(true)
  })

  it('em branco é criação, não erro', () => {
    const r = saveSynseContentSchema.safeParse({ ...base, id: '' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.id).toBe('')
  })
})

describe('visibilidade do acervo', () => {
  const base = { type: 'EBOOK' as const, title: 'Um título qualquer' }

  it('o padrão é o Synse+', () => {
    /*
     * Errar para o lado de trancar se desfaz num clique; errar para o lado de
     * abrir não desfaz quem já baixou. O padrão é a escolha reversível.
     */
    const r = saveSynseContentSchema.safeParse(base)
    expect(r.success && r.data.visibility).toBe('SYNSE_PLUS')
  })

  it('recusa ORGANIZATION — acervo não tem dono', () => {
    const r = saveSynseContentSchema.safeParse({ ...base, visibility: 'ORGANIZATION' })
    expect(r.success).toBe(false)
  })
})
