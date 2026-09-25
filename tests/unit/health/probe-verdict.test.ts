import { describe, expect, it } from 'vitest'

import { vereditoDeFuncao, vereditoDeRecurso } from '@/lib/health/probe-verdict'

/**
 * A sonda que erra o veredito é pior do que a sonda que não existe: o endereço
 * passa a afirmar, com confiança, que está tudo no lugar. Esta é a lógica que
 * decide, e até agora ela não tinha teste nenhum.
 */

describe('vereditoDeRecurso', () => {
  it('lê 200 como "o schema aceitou a pergunta"', () => {
    // Lista vazia é a RLS negando linha — o conteúdo não importa aqui.
    expect(vereditoDeRecurso(200)).toEqual({ present: true, status: 200 })
    expect(vereditoDeRecurso(206)).toEqual({ present: true, status: 206 })
  })

  it('lê 400 e 404 como "ainda não existe"', () => {
    // 400 é 42703 (coluna que falta); 404 é PGRST205 (tabela que falta).
    expect(vereditoDeRecurso(400)).toEqual({ present: false, status: 400 })
    expect(vereditoDeRecurso(404)).toEqual({ present: false, status: 404 })
  })

  it('não chuta diante de credencial ou indisponibilidade', () => {
    // Chave errada não é migration faltando, e dizer que falta mandaria
    // alguém colar SQL que já está no banco.
    for (const status of [401, 403, 429, 500, 502, 503]) {
      expect(vereditoDeRecurso(status)).toEqual({ present: null, status })
    }
  })
})

describe('vereditoDeFuncao', () => {
  it('lê 401 e 403 como "existe, e está revogada" ', () => {
    expect(vereditoDeFuncao(401)).toEqual({ present: true, status: 401 })
    expect(vereditoDeFuncao(403)).toEqual({ present: true, status: 403 })
  })

  it('lê 404 como "a migration ainda não foi colada"', () => {
    expect(vereditoDeFuncao(404)).toEqual({ present: false, status: 404 })
  })

  it('sem `executa`, não conclui nada de um 200', () => {
    // Uma função revogada respondendo 200 significa que ela executou para o
    // anônimo. Isso é notícia ruim, não confirmação — e a sonda não é o lugar
    // de decidir o que fazer com ela.
    expect(vereditoDeFuncao(200)).toEqual({ present: null, status: 200 })
  })

  it('com `executa`, lê 200 como confirmação', () => {
    // O caso da 0035: `security invoker`, sem `revoke`. O anônimo executa e a
    // RLS devolve lista vazia — conferido em `tests/db/aderencia.test.ts`.
    expect(vereditoDeFuncao(200, { executa: true })).toEqual({ present: true, status: 200 })
  })

  it('`executa` não muda o resto', () => {
    expect(vereditoDeFuncao(404, { executa: true })).toEqual({ present: false, status: 404 })
    expect(vereditoDeFuncao(401, { executa: true })).toEqual({ present: true, status: 401 })
    expect(vereditoDeFuncao(500, { executa: true })).toEqual({ present: null, status: 500 })
  })
})
