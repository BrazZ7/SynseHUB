import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  contarNaMemoria,
  esquecerTudo,
  limparExpirados,
  memoriaInterna,
} from '@/lib/rate-limit/memoria'

/**
 * ── O limitador, nos dois lugares onde ele pode morar ───────────────────────
 *
 * Em memória ele já existia e nunca tinha teste. No Redis é novo, e o motivo
 * de existir é que a contagem em memória **não vale na Vercel**: cada função
 * tem a sua, e "cinco por minuto" vira cinco por instância.
 *
 * O `fetch` do Upstash é injetado: não há Redis neste repositório, e a
 * alternativa a testar assim seria não testar.
 */

beforeEach(() => esquecerTudo())

describe('contagem em memória', () => {
  const T0 = 1_000_000

  it('deixa passar até o limite', () => {
    for (let i = 1; i <= 5; i += 1) {
      expect(contarNaMemoria('k', 5, 60_000, T0).allowed, `pedido ${i}`).toBe(true)
    }
  })

  it('barra o seguinte', () => {
    for (let i = 0; i < 5; i += 1) contarNaMemoria('k', 5, 60_000, T0)
    expect(contarNaMemoria('k', 5, 60_000, T0).allowed).toBe(false)
  })

  it('a janela vence e solta de novo', () => {
    for (let i = 0; i < 5; i += 1) contarNaMemoria('k', 5, 60_000, T0)
    expect(contarNaMemoria('k', 5, 60_000, T0 + 60_001).allowed).toBe(true)
  })

  it('insistir não empurra a janela para frente', () => {
    /*
     * Janela fixa, e isto é o que a torna fixa: o prazo é o do primeiro
     * pedido. Renovar a cada acesso daria "enquanto insistir, nunca zera" —
     * que é o oposto de um limite.
     */
    const primeiro = contarNaMemoria('k', 5, 60_000, T0)
    const depois = contarNaMemoria('k', 5, 60_000, T0 + 30_000)
    expect(depois.resetAt).toBe(primeiro.resetAt)
  })

  it('chaves diferentes não dividem a cota', () => {
    for (let i = 0; i < 5; i += 1) contarNaMemoria('a', 5, 60_000, T0)
    expect(contarNaMemoria('b', 5, 60_000, T0).allowed).toBe(true)
  })

  it('a limpeza tira o vencido e preserva o que vale', () => {
    contarNaMemoria('velha', 5, 1_000, T0)
    contarNaMemoria('nova', 5, 60_000, T0)
    limparExpirados(T0 + 2_000)

    // A velha foi embora: a contagem recomeça do 1 e sobra 4.
    expect(contarNaMemoria('velha', 5, 60_000, T0 + 2_000).remaining).toBe(4)
    // A nova continua: este é o segundo pedido dela.
    expect(contarNaMemoria('nova', 5, 60_000, T0 + 2_000).remaining).toBe(3)
  })
})

// ── Upstash ──────────────────────────────────────────────────────────────────

function respostaFalsa(corpo: unknown, ok = true, status = 200) {
  const chamadas: { url: string; init: RequestInit }[] = []
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    chamadas.push({ url: String(url), init: init ?? {} })
    return { ok, status, json: async () => corpo } as Response
  })
  return { impl: impl as unknown as typeof fetch, chamadas }
}

async function comUpstash() {
  vi.resetModules()
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://exemplo.upstash.io')
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token-de-teste')
  return import('@/lib/rate-limit/upstash')
}

afterEach(() => vi.unstubAllEnvs())

describe('contagem no Redis', () => {
  it('manda uma operação só, com o script e a chave', async () => {
    /*
     * Uma operação, e não INCR + PEXPIRE no pipeline, porque o `/pipeline` do
     * Upstash não é atômico: com os dois separados existe o estado em que a
     * chave é criada e fica **sem prazo**, e aí o contador nunca zera e a
     * pessoa fica barrada para sempre.
     */
    const { contarNoRedis } = await comUpstash()
    const { impl, chamadas } = respostaFalsa({ result: [1, 60_000] })

    await contarNoRedis('login:alguem', 5, 60_000, impl)

    expect(chamadas).toHaveLength(1)
    const corpo = JSON.parse(String(chamadas[0].init.body))
    expect(corpo[0]).toBe('EVAL')
    expect(corpo[1]).toContain('INCR')
    expect(corpo[1]).toContain('PEXPIRE')
    expect(corpo[2]).toBe('1')
    expect(corpo[3]).toBe('login:alguem')
    expect(corpo[4]).toBe('60000')

    const cabecalhos = chamadas[0].init.headers as Record<string, string>
    expect(cabecalhos.Authorization).toBe('Bearer token-de-teste')
  })

  it('o script só põe prazo no pedido que abre a janela', async () => {
    const { contarNoRedis } = await comUpstash()
    const { impl, chamadas } = respostaFalsa({ result: [1, 60_000] })
    await contarNoRedis('k', 5, 60_000, impl)

    // `if atual == 1` é o que impede a janela de ser empurrada a cada acesso.
    expect(JSON.parse(String(chamadas[0].init.body))[1]).toMatch(/if\s+atual\s*==\s*1/)
  })

  it('dentro do limite, libera', async () => {
    const { contarNoRedis } = await comUpstash()
    const { impl } = respostaFalsa({ result: [3, 42_000] })

    const r = await contarNoRedis('k', 5, 60_000, impl)
    expect(r).toMatchObject({ allowed: true, remaining: 2 })
  })

  it('acima do limite, barra', async () => {
    const { contarNoRedis } = await comUpstash()
    const { impl } = respostaFalsa({ result: [6, 42_000] })

    const r = await contarNoRedis('k', 5, 60_000, impl)
    expect(r).toMatchObject({ allowed: false, remaining: 0 })
  })

  it('exatamente no limite ainda passa', async () => {
    const { contarNoRedis } = await comUpstash()
    const { impl } = respostaFalsa({ result: [5, 42_000] })
    expect((await contarNoRedis('k', 5, 60_000, impl))?.allowed).toBe(true)
  })

  it.each([
    ['HTTP de erro', { result: null }, false, 500],
    ['corpo com error', { error: 'WRONGTYPE' }, true, 200],
    ['resultado fora do formato', { result: 'nada disso' }, true, 200],
    ['array curto demais', { result: [1] }, true, 200],
  ])('devolve nulo quando %s, para quem chama decidir', async (_n, corpo, ok, status) => {
    const { contarNoRedis } = await comUpstash()
    const { impl } = respostaFalsa(corpo, ok, status)
    expect(await contarNoRedis('k', 5, 60_000, impl)).toBeNull()
  })

  it('rede caindo não lança — o limitador nunca derruba a ação', async () => {
    /*
     * Ele é proteção em profundidade, não autorização: quem barra escrita
     * indevida é `requirePermission` e a RLS. Lançar aqui trocaria um limite
     * frouxo por uma indisponibilidade.
     */
    const { contarNoRedis } = await comUpstash()
    const impl = (async () => {
      throw new Error('ECONNRESET')
    }) as unknown as typeof fetch

    await expect(contarNoRedis('k', 5, 60_000, impl)).resolves.toBeNull()
  })

  it('PTTL negativo não vira prazo no passado', async () => {
    // -1 é chave sem prazo. A janela cheia é o palpite seguro.
    const { contarNoRedis } = await comUpstash()
    const { impl } = respostaFalsa({ result: [1, -1] })

    const r = await contarNoRedis('k', 5, 60_000, impl)
    expect(r!.resetAt).toBeGreaterThan(Date.now())
  })
})

describe('qual backend entra', () => {
  it('sem Upstash configurado, o limite é só desta instância', async () => {
    vi.resetModules()
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')

    const { rateLimitCompartilhado, rateLimit } = await import('@/lib/rate-limit')
    expect(rateLimitCompartilhado()).toBe(false)
    expect((await rateLimit('k', 2, 60_000)).allowed).toBe(true)
  })

  it('com as duas variáveis, passa a ser compartilhado', async () => {
    vi.resetModules()
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://exemplo.upstash.io')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token')

    const { rateLimitCompartilhado } = await import('@/lib/rate-limit')
    expect(rateLimitCompartilhado()).toBe(true)
  })

  it('só a URL não basta — meia configuração não é configuração', async () => {
    vi.resetModules()
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://exemplo.upstash.io')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')

    const { rateLimitCompartilhado } = await import('@/lib/rate-limit')
    expect(rateLimitCompartilhado()).toBe(false)
  })
})

describe('a memória se limpa sozinha', () => {
  /*
   * `limparExpirados` era chamado pelos handlers, e estava em 3 dos 20
   * caminhos que limitam alguma coisa — login, recuperação de senha e
   * convite de equipe não limpavam nada. Depender de o chamador lembrar é a
   * forma como ele esquece: as três chamadas são de quando havia três
   * lugares, e nenhum dos dezessete seguintes copiou a linha.
   */
  it('varre o que venceu quando o mapa passa do teto', () => {
    const T0 = 2_000_000

    // Enche acima do teto com chaves de janela curta.
    for (let i = 0; i <= memoriaInterna.teto; i += 1) {
      contarNaMemoria(`velha-${i}`, 5, 1_000, T0)
    }
    expect(memoriaInterna.tamanho()).toBeGreaterThan(memoriaInterna.teto)

    // Um pedido depois de todas vencerem: a varredura entra sozinha.
    contarNaMemoria('nova', 5, 60_000, T0 + 5_000)

    expect(memoriaInterna.tamanho()).toBe(1)
  })

  it('e não joga fora quem ainda está dentro da janela', () => {
    /*
     * O controle. Uma varredura que limpa demais zeraria a contagem de quem
     * está sendo limitado agora — o limitador soltaria exatamente quem ele
     * deveria estar segurando.
     */
    const T0 = 3_000_000
    for (let i = 0; i <= memoriaInterna.teto; i += 1) {
      contarNaMemoria(`velha-${i}`, 5, 1_000, T0)
    }
    contarNaMemoria('viva', 5, 600_000, T0)

    contarNaMemoria('gatilho', 5, 60_000, T0 + 5_000)

    // 'viva' sobreviveu com a contagem: o segundo pedido é o segundo mesmo.
    expect(contarNaMemoria('viva', 5, 600_000, T0 + 5_000).remaining).toBe(3)
  })
})

describe('a sonda do Upstash', () => {
  /*
   * ── Por que ela existe ────────────────────────────────────────────────────
   *
   * `rateLimitCompartilhado` responde "as duas variáveis não estão vazias", e
   * a saúde publicava isso como se fosse "o limite vale para todas as
   * instâncias". Token errado, token **somente-leitura** — o painel do
   * Upstash oferece os dois e o de leitura vem primeiro — ou banco apagado
   * passam como configurado, e aí todo pedido cai para a memória em silêncio.
   *
   * É o mesmo formato de sonda cega que já me enganou duas vezes neste
   * projeto: uma que mede a configuração em vez do efeito não mede nada.
   */
  it('sem as variáveis, não inventa um veredito', async () => {
    // `respondendo: null` é "não foi perguntado", que é diferente de "não".
    vi.resetModules()
    const { sondarUpstash } = await import('@/lib/rate-limit/upstash')
    const { impl } = respostaFalsa({ result: [1, 10_000] })

    expect(await sondarUpstash(impl)).toEqual({
      configurado: false,
      respondendo: null,
      latenciaMs: null,
    })
  })

  it('escreve pelo caminho do limitador, e não um PING', async () => {
    /*
     * A asserção que importa. `PING` passa com token somente-leitura, e a
     * sonda aprovaria justamente a credencial que não serve. Ela precisa
     * mandar o `EVAL` do script — o mesmo que o limitador manda.
     */
    const { sondarUpstash } = await comUpstash()
    const { impl, chamadas } = respostaFalsa({ result: [1, 10_000] })

    await sondarUpstash(impl)

    expect(chamadas).toHaveLength(1)
    const comando = JSON.parse(String(chamadas[0].init.body)) as string[]
    expect(comando[0]).toBe('EVAL')
    expect(comando[1]).toContain('INCR')
    expect(JSON.stringify(comando)).not.toContain('PING')
  })

  it('a chave da sonda é própria e não encosta na de ninguém', async () => {
    const { sondarUpstash } = await comUpstash()
    const { impl, chamadas } = respostaFalsa({ result: [1, 10_000] })

    await sondarUpstash(impl)

    const comando = JSON.parse(String(chamadas[0].init.body)) as string[]
    expect(comando[3]).toBe('health:sonda')
    // Prazo curto: a sonda não deixa lixo com validade longa no Redis.
    expect(Number(comando[4])).toBeLessThanOrEqual(10_000)
  })

  it('Redis fora do ar devolve "não responde", não um erro', async () => {
    const { sondarUpstash } = await comUpstash()
    const quebrado = (async () => {
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof fetch

    expect(await sondarUpstash(quebrado)).toMatchObject({
      configurado: true,
      respondendo: false,
      latenciaMs: null,
      // O motivo entrou depois: `respondendo: false` sozinho deixava quatro
      // consertos diferentes para adivinhar, e aconteceu em produção.
      motivo: expect.stringContaining('sem_resposta'),
    })
  })

  it('token recusado conta como não respondendo', async () => {
    // 401 é exatamente o caso que o campo raso deixava passar como pronto.
    const { sondarUpstash } = await comUpstash()
    const { impl } = respostaFalsa({ error: 'WRONGPASS' }, false, 401)

    const d = await sondarUpstash(impl)
    expect(d.configurado).toBe(true)
    expect(d.respondendo).toBe(false)
  })

  it('respondeu: diz que sim e quanto demorou', async () => {
    const { sondarUpstash } = await comUpstash()
    const { impl } = respostaFalsa({ result: [1, 10_000] })

    const d = await sondarUpstash(impl)
    expect(d.respondendo).toBe(true)
    expect(d.latenciaMs).toBeGreaterThanOrEqual(0)
  })
})
