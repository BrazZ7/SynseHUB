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
