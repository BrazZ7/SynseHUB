import { beforeEach, describe, expect, it } from 'vitest'

import { recordError, readErrorsFor } from '@/lib/observability/recent-errors'
import { subjectFromCookieHeader } from '@/lib/observability/request-subject'

/**
 * O registro de erros só é aceitável porque cada um lê apenas o próprio: uma
 * mensagem de erro carrega o que a requisição estava fazendo, e isso é da
 * pessoa que a fez.
 */
const erro = (sub: string | null, message = 'falhou') => ({
  at: new Date().toISOString(),
  path: '/dashboard · render',
  digest: '123',
  message,
  frames: [],
  sub,
})

function jwtCom(sub: string): string {
  const payload = Buffer.from(JSON.stringify({ sub }), 'utf8').toString('base64url')
  return `cabecalho.${payload}.assinatura`
}

beforeEach(() => {
  const alvo = globalThis as unknown as Record<symbol, unknown>
  alvo[Symbol.for('synse.recent.errors')] = []
})

describe('registro de erros recentes', () => {
  it('devolve só os do próprio leitor, e conta os demais', () => {
    recordError(erro('ana', 'erro da ana'))
    recordError(erro('bruno', 'erro do bruno'))
    recordError(erro(null, 'erro sem sessão'))

    const { meus, deOutros } = readErrorsFor('ana')

    expect(meus.map((item) => item.message)).toEqual(['erro da ana'])
    expect(deOutros).toBe(2)
  })

  it('sem sessão não lê erro de ninguém', () => {
    recordError(erro('ana'))
    expect(readErrorsFor(null)).toMatchObject({ meus: [], deOutros: 1 })
  })

  it('mais recente primeiro', () => {
    recordError(erro('ana', 'primeiro'))
    recordError(erro('ana', 'segundo'))

    expect(readErrorsFor('ana').meus.map((item) => item.message)).toEqual(['segundo', 'primeiro'])
  })

  it('não cresce sem limite', () => {
    for (let i = 0; i < 50; i += 1) recordError(erro('ana', `erro ${i}`))

    const { meus } = readErrorsFor('ana')
    expect(meus).toHaveLength(20)
    expect(meus[0].message).toBe('erro 49')
  })
})

describe('subjectFromCookieHeader', () => {
  it('lê o sub do token do Supabase em cada formato de cookie', () => {
    const jwt = jwtCom('ea4ea6c9-0000-0000-0000-000000000001')

    expect(subjectFromCookieHeader(`sb-projeto-auth-token=${jwt}`)).toBe(
      'ea4ea6c9-0000-0000-0000-000000000001',
    )

    const arranjo = encodeURIComponent(JSON.stringify([jwt, 'refresh']))
    expect(subjectFromCookieHeader(`outro=1; sb-projeto-auth-token=${arranjo}`)).toBe(
      'ea4ea6c9-0000-0000-0000-000000000001',
    )

    const base64 = `base64-${Buffer.from(JSON.stringify({ access_token: jwt }), 'utf8').toString('base64')}`
    expect(subjectFromCookieHeader(`sb-projeto-auth-token=${encodeURIComponent(base64)}`)).toBe(
      'ea4ea6c9-0000-0000-0000-000000000001',
    )
  })

  it('cookie ausente, alheio ou corrompido não vira sujeito', () => {
    expect(subjectFromCookieHeader(null)).toBeNull()
    expect(subjectFromCookieHeader('tema=escuro')).toBeNull()
    expect(subjectFromCookieHeader('sb-projeto-auth-token=lixo')).toBeNull()
    expect(subjectFromCookieHeader('sb-projeto-auth-token=a.b.c')).toBeNull()
  })
})
