import { describe, expect, it } from 'vitest'

import {
  accessTokenDosCookies,
  middlewareDeveRenovar,
  precisaRenovar,
} from '@/lib/auth/token-vence-em'

/** Monta um JWT de mentira com o `exp` pedido. Só o payload importa aqui. */
function tokenCom(exp: number | string | undefined): string {
  const payload = exp === undefined ? {} : { exp }
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `cabecalho.${b64}.assinatura`
}

const AGORA = () => Math.floor(Date.now() / 1000)

describe('precisaRenovar', () => {
  it('token com uma hora pela frente não precisa', () => {
    expect(precisaRenovar(tokenCom(AGORA() + 3600))).toBe(false)
  })

  it('token vencendo em 5 minutos precisa — a margem é 10', () => {
    expect(precisaRenovar(tokenCom(AGORA() + 300))).toBe(true)
  })

  it('token já vencido precisa', () => {
    expect(precisaRenovar(tokenCom(AGORA() - 10))).toBe(true)
  })

  /*
   * Os quatro casos de dúvida. Todos devolvem `true`, e isso é a decisão de
   * projeto: errar para o lado de uma ida à rede a mais custa latência; errar
   * para o outro derruba a pessoa no meio do trabalho.
   */
  it.each([
    ['nulo', null],
    ['vazio', ''],
    ['não é JWT', 'qualquer-coisa'],
    ['payload que não decodifica', 'a.!!!.c'],
    ['JSON válido sem exp', tokenCom(undefined)],
    ['exp que não é número', tokenCom('amanhã')],
  ])('na dúvida renova: %s', (_caso, valor) => {
    expect(precisaRenovar(valor)).toBe(true)
  })

  it('a margem é configurável, e o padrão é 10 minutos', () => {
    const daquiA15Min = tokenCom(AGORA() + 900)
    expect(precisaRenovar(daquiA15Min)).toBe(false)
    expect(precisaRenovar(daquiA15Min, 1800)).toBe(true)
  })
})

describe('accessTokenDosCookies', () => {
  const sessao = (token: string) => JSON.stringify({ access_token: token, token_type: 'bearer' })

  it('lê o cookie simples', () => {
    expect(
      accessTokenDosCookies([
        { name: 'outro', value: 'x' },
        { name: 'sb-abcdef-auth-token', value: sessao('T1') },
      ]),
    ).toBe('T1')
  })

  it('lê o cookie com prefixo base64-', () => {
    const codificado = 'base64-' + Buffer.from(sessao('T2')).toString('base64')
    expect(accessTokenDosCookies([{ name: 'sb-abc-auth-token', value: codificado }])).toBe('T2')
  })

  it('junta os pedaços na ordem numérica, não na alfabética', () => {
    /*
     * O caso que mais importa: o `@supabase/ssr` parte o cookie quando ele
     * passa do limite do navegador, e é a sessão **grande** que se parte — a
     * de quem tem mais dado. Ordenar como texto puro poria `...10` antes de
     * `...2` e o JSON não fecharia, derrubando justamente essas pessoas.
     */
    const inteiro = sessao('T3-' + 'x'.repeat(200))
    const pedacos = inteiro.match(/.{1,10}/g) as string[]
    expect(pedacos.length).toBeGreaterThan(10) // o controle: tem que passar de 9

    const cookies = pedacos.map((v, i) => ({ name: `sb-abc-auth-token.${i}`, value: v }))
    const embaralhados = [...cookies].reverse()

    expect(accessTokenDosCookies(embaralhados)).toBe('T3-' + 'x'.repeat(200))
  })

  it('sem cookie de sessão devolve nulo, e aí o middleware renova', () => {
    expect(accessTokenDosCookies([{ name: 'tema', value: 'escuro' }])).toBeNull()
    expect(accessTokenDosCookies([])).toBeNull()
  })

  it('cookie corrompido devolve nulo em vez de estourar', () => {
    // Middleware que lança exceção derruba o site inteiro, não uma tela.
    expect(accessTokenDosCookies([{ name: 'sb-abc-auth-token', value: '{quebrado' }])).toBeNull()
    expect(accessTokenDosCookies([{ name: 'sb-abc-auth-token', value: 'base64-!!!' }])).toBeNull()
  })

  it('ignora outros cookies do Supabase que não são a sessão', () => {
    expect(
      accessTokenDosCookies([
        { name: 'sb-abc-auth-token-code-verifier', value: 'nao-e-sessao' },
        { name: 'sb-abc-auth-token', value: sessao('T4') },
      ]),
    ).toBe('T4')
  })
})

describe('middlewareDeveRenovar', () => {
  /*
   * A distinção que eu tinha errado: `precisaRenovar(null)` é `true` de
   * propósito, mas "não há sessão" não é "renove". O comentário do middleware
   * prometia a saída rápida para o anônimo e o código mandava ele pelo
   * caminho completo, com a ida à rede inteira.
   */
  it('sem token não renova — não há sessão para renovar', () => {
    expect(middlewareDeveRenovar(null)).toBe(false)
    expect(middlewareDeveRenovar(undefined)).toBe(false)
    expect(middlewareDeveRenovar('')).toBe(false)
  })

  it('e isso é o oposto de precisaRenovar, que na dúvida renova', () => {
    // O controle: se as duas respondessem igual, uma delas seria supérflua.
    expect(precisaRenovar(null)).toBe(true)
    expect(middlewareDeveRenovar(null)).toBe(false)
  })

  it('com token fresco não renova', () => {
    expect(middlewareDeveRenovar(tokenCom(AGORA() + 3600))).toBe(false)
  })

  it('com token perto de vencer, renova', () => {
    expect(middlewareDeveRenovar(tokenCom(AGORA() + 60))).toBe(true)
  })

  it('token ilegível com sessão presente renova — na dúvida, renova', () => {
    expect(middlewareDeveRenovar('nao-e-jwt')).toBe(true)
  })
})
