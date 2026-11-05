import { createServer, type Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * ── O limitador contra um Redis que conta de verdade ───────────────────────
 *
 * Os outros testes injetam o `fetch` e provam o que o adaptador **manda** e
 * como ele lê a resposta. Este sobe um servidor HTTP que fala o protocolo do
 * Upstash com um contador real e exercita o caminho inteiro: a contagem
 * compartilhada e a sonda de saúde.
 *
 * ── Por que ele ficou, desta vez ────────────────────────────────────────────
 *
 * Um teste assim existiu em 01/10 e eu decidi não guardá-lo "por abrir
 * porta". Estou voltando atrás, e o motivo é o caso do token
 * **somente-leitura**: o painel do Upstash oferece dois tokens e mostra o de
 * leitura primeiro, ele passa num `PING`, e com ele todo pedido cai para a
 * memória em silêncio. É o erro mais provável de quem for ligar isso — e com
 * `fetch` injetado eu provo que a sonda lida com a *resposta* de recusa, não
 * que ela chega a recusar de ponta a ponta.
 *
 * A porta é efêmera (`listen(0)`) e em `127.0.0.1`, o servidor fecha no
 * `afterAll`, e o arquivo roda em menos de meio segundo. Se um dia isso
 * atrapalhar num ambiente fechado, o conserto é apagar este arquivo — os
 * outros 28 testes continuam de pé.
 */

/** Um Upstash de mentira que fala o protocolo de verdade, com contador real. */
let servidor: Server
let base = ''
const contadores = new Map<string, { n: number; venceEm: number }>()
let tokenSomenteLeitura = false

beforeAll(async () => {
  servidor = createServer((req, res) => {
    let corpo = ''
    req.on('data', (c) => (corpo += c))
    req.on('end', () => {
      const auth = req.headers.authorization ?? ''
      if (auth !== 'Bearer token-de-escrita') {
        res.writeHead(401).end(JSON.stringify({ error: 'WRONGPASS' }))
        return
      }
      const cmd = JSON.parse(corpo) as string[]
      if (cmd[0] !== 'EVAL') {
        res.writeHead(400).end(JSON.stringify({ error: 'ERR unknown' }))
        return
      }
      // O token somente-leitura do Upstash recusa escrita dentro do script.
      if (tokenSomenteLeitura) {
        res.writeHead(200).end(JSON.stringify({ error: 'ERR write command not allowed' }))
        return
      }
      const chave = cmd[3]
      const janela = Number(cmd[4])
      const agora = Date.now()
      const atual = contadores.get(chave)
      if (!atual || atual.venceEm <= agora) {
        contadores.set(chave, { n: 1, venceEm: agora + janela })
      } else {
        atual.n += 1
      }
      const b = contadores.get(chave)!
      res.writeHead(200).end(JSON.stringify({ result: [b.n, b.venceEm - agora] }))
    })
  })
  await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r))
  const addr = servidor.address()
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`
})

afterAll(() => new Promise<void>((r) => servidor.close(() => r())))

async function comRedisReal(token = 'token-de-escrita') {
  vi.resetModules()
  vi.stubEnv('UPSTASH_REDIS_REST_URL', base)
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', token)
  return import('@/lib/rate-limit')
}

describe('fio: contra um Redis que conta de verdade', () => {
  it('o limite vale, e vale compartilhado', async () => {
    const { rateLimit } = await comRedisReal()
    const chave = `fio-${Date.now()}`

    for (let i = 1; i <= 3; i += 1) {
      expect((await rateLimit(chave, 3, 60_000)).allowed, `pedido ${i}`).toBe(true)
    }
    expect((await rateLimit(chave, 3, 60_000)).allowed).toBe(false)
  })

  it('a sonda aprova o token de escrita', async () => {
    vi.resetModules()
    vi.stubEnv('UPSTASH_REDIS_REST_URL', base)
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token-de-escrita')
    const { sondarUpstash } = await import('@/lib/rate-limit/upstash')

    const d = await sondarUpstash()
    expect(d).toMatchObject({ configurado: true, respondendo: true })
    expect(d.latenciaMs).toBeGreaterThanOrEqual(0)
  })

  it('e recusa o token somente-leitura, que é o erro que o painel induz', async () => {
    tokenSomenteLeitura = true
    vi.resetModules()
    vi.stubEnv('UPSTASH_REDIS_REST_URL', base)
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token-de-escrita')
    const { sondarUpstash } = await import('@/lib/rate-limit/upstash')

    expect(await sondarUpstash()).toMatchObject({ configurado: true, respondendo: false })
    tokenSomenteLeitura = false
  })

  it('e recusa o token errado', async () => {
    vi.resetModules()
    vi.stubEnv('UPSTASH_REDIS_REST_URL', base)
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token-errado')
    const { sondarUpstash } = await import('@/lib/rate-limit/upstash')

    expect(await sondarUpstash()).toMatchObject({ configurado: true, respondendo: false })
  })
})

/**
 * ── A sonda diz **por que** não respondeu ───────────────────────────────────
 *
 * `respondendo: false` sozinho manda quem está ligando o Redis adivinhar entre
 * quatro consertos: token errado, token somente-leitura, URL de conexão no
 * lugar da REST, e banco apagado. Os quatro chegam como o mesmo campo falso.
 *
 * Aconteceu de verdade: a sonda acusou `configurado: true, respondendo: false`
 * em produção e não havia como saber qual dos quatro era sem mexer no painel.
 */
describe('o motivo da recusa', () => {
  const comFetch = async (resposta: Response | Error, url = 'https://exemplo.upstash.io') => {
    // O módulo lê as variáveis na importação, então o `resetModules` tem de
    // vir antes — foi o que me pegou na primeira versão deste arquivo.
    vi.resetModules()
    vi.stubEnv('UPSTASH_REDIS_REST_URL', url)
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token-qualquer')
    const { sondarUpstash } = await import('@/lib/rate-limit/upstash')
    const falso = (async () => {
      if (resposta instanceof Error) throw resposta
      return resposta
    }) as unknown as typeof fetch
    return sondarUpstash(falso)
  }

  it('token recusado vem como http_401', async () => {
    const d = await comFetch(new Response('Unauthorized', { status: 401 }))

    expect(d.respondendo).toBe(false)
    expect(d.motivo).toBe('http_401')
  })

  it('token somente-leitura vem com o texto do Redis', async () => {
    /*
     * É o erro mais provável de quem for ligar: o painel do Upstash mostra
     * dois tokens e o somente-leitura vem primeiro. Ele **autentica** — então
     * não dá 401 —, e recusa só na escrita, com NOPERM no corpo. Sem repassar
     * esse texto, este caso é idêntico a "banco apagado" na tela.
     */
    const d = await comFetch(
      Response.json({ error: 'NOPERM this user has no permissions to run the EVAL command' }),
    )

    expect(d.respondendo).toBe(false)
    expect(d.motivo).toMatch(/NOPERM/)
  })

  it('URL de conexão no lugar da REST é apontada pela forma', async () => {
    /*
     * `rediss://` faz o `fetch` pendurar até o tempo estourar, e o sintoma
     * chega como "sem resposta" — que parece rede caída. A forma da URL é
     * olhada sem ir à rede, e sem publicar o endereço.
     */
    const tcp = await comFetch(
      new Error('TimeoutError: signal timed out'),
      'rediss://exemplo.upstash.io:6379',
    )

    expect(tcp.respondendo).toBe(false)
    expect(tcp.motivo).toMatch(/sem_resposta/)
    expect(tcp.urlParece).toBe('tcp')

    // O controle: a mesma falha de rede com a URL certa não acusa a URL.
    const rest = await comFetch(new Error('fetch failed'))
    expect(rest.urlParece).toBe('rest')
  })

  it('valor colado com aspas é apontado pelo nome', async () => {
    /*
     * O que de fato aconteceu ao ligar isto em produção: a URL foi colada com
     * as aspas em volta, e o `fetch` recusou antes de haver rede. O sintoma
     * chegava como `sem_resposta`, idêntico a "endereço errado" — e a aposta
     * natural era o token somente-leitura, que não tinha nada a ver.
     */
    const d = await comFetch(
      new TypeError('Failed to parse URL from "https://exemplo.upstash.io"'),
      '"https://exemplo.upstash.io"',
    )

    expect(d.respondendo).toBe(false)
    expect(d.urlParece).toBe('com_aspas')
  })

  it('o endereço não vaza no texto do erro', async () => {
    /*
     * `/api/health` é público, e o `TypeError` do `fetch` traz a URL inteira
     * dentro da mensagem. O endereço não é segredo — sem o token ele não serve
     * —, mas `urlParece` existe para falar da URL **sem** mostrá-la, e deixar o
     * texto do erro contrariar isso seria manter o cuidado só na aparência.
     */
    const d = await comFetch(
      new TypeError('Failed to parse URL from "https://harmless-yak-194171.upstash.io"'),
      '"https://harmless-yak-194171.upstash.io"',
    )

    expect(d.motivo).not.toMatch(/harmless-yak/)
    expect(d.motivo).not.toMatch(/upstash\.io/)
    expect(d.motivo).toMatch(/<url>/)
  })

  it('quando responde, não inventa motivo nem forma', async () => {
    const d = await comFetch(Response.json({ result: [1, 10_000] }))

    expect(d.respondendo).toBe(true)
    expect(d.motivo).toBeUndefined()
    expect(d.urlParece).toBeUndefined()
    expect(d.latenciaMs).toBeGreaterThanOrEqual(0)
  })
})
