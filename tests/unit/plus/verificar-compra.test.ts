import { createPrivateKey, createPublicKey, createSign, createVerify } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { verificarCompraDaLoja } from '@/features/plus/loja/verificar-service'
import {
  contaDeServicoDoGoogle,
  limparCacheDoToken,
  montarJwtDaContaDeServico,
} from '@/lib/plans/lojas/google-api'
import { APP_ID, PRODUTO_MENSAL } from '@/lib/plans/lojas/tipos'

/**
 * A verificação da compra, de ponta a ponta sem rede.
 *
 * ── O recibo emprestado ──────────────────────────────────────────────────────
 *
 * O caso que estes testes existem para fechar, e o menos óbvio de todos: um
 * recibo da App Store é um documento **válido**, assinado pela Apple, que
 * qualquer pessoa extrai do próprio aparelho. Sem amarrá-lo à conta, ele vira
 * senha de Synse+ — uma pessoa assina, publica o texto num grupo, e todo mundo
 * que colar recebe acesso. Criptografia impecável, uma assinatura vendida.
 */

const PERFIL = '11111111-1111-1111-1111-111111111111'
const OUTRO_PERFIL = '99999999-9999-9999-9999-999999999999'

// ── A cadeia de teste, igual à de `apple-jws.test.ts` ───────────────────────

type Cadeia = { raizPem: string; x5c: string[]; chave: ReturnType<typeof createPrivateKey> }

function gerarCadeia(): Cadeia {
  const dir = mkdtempSync(join(tmpdir(), 'synse-compra-'))
  const ossl = (args: string[]) =>
    execFileSync('openssl', args, { cwd: dir, stdio: ['ignore', 'ignore', 'ignore'] })

  for (const nome of ['raiz', 'inter', 'folha']) {
    ossl(['ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', `${nome}.key`])
  }
  writeFileSync(join(dir, 'ca.cnf'), 'basicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign\n')
  writeFileSync(join(dir, 'folha.cnf'), 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\n')

  ossl([
    'req', '-new', '-x509', '-key', 'raiz.key', '-out', 'raiz.crt', '-days', '365',
    '-subj', '/CN=Raiz de Teste', '-addext', 'basicConstraints=critical,CA:TRUE',
    '-addext', 'keyUsage=critical,keyCertSign',
  ])
  for (const [nome, chaveCa, crtCa, cnf, assunto] of [
    ['inter', 'raiz.key', 'raiz.crt', 'ca.cnf', '/CN=Inter de Teste'],
    ['folha', 'inter.key', 'inter.crt', 'folha.cnf', '/CN=Folha de Teste'],
  ] as const) {
    ossl(['req', '-new', '-key', `${nome}.key`, '-out', `${nome}.csr`, '-subj', assunto])
    ossl([
      'x509', '-req', '-in', `${nome}.csr`, '-CA', crtCa, '-CAkey', chaveCa,
      '-CAcreateserial', '-out', `${nome}.crt`, '-days', '365', '-extfile', cnf,
    ])
  }

  const der = (nome: string) =>
    readFileSync(join(dir, `${nome}.crt`), 'utf8')
      .replace(/-----[A-Z ]+-----/g, '')
      .replace(/\s+/g, '')

  return {
    raizPem: readFileSync(join(dir, 'raiz.crt'), 'utf8'),
    x5c: [der('folha'), der('inter'), der('raiz')],
    chave: createPrivateKey(readFileSync(join(dir, 'folha.key'), 'utf8')),
  }
}

let cadeia: Cadeia
/**
 * Conta de serviço com chave RSA **de verdade**.
 *
 * A primeira versão usava `private_key: 'x'` nos testes do Google, e o caminho
 * feliz falhou: `montarJwtDaContaDeServico` estoura ao assinar com isso, e o
 * erro era capturado como "loja indisponível" antes de a API dublada ser
 * chamada. O teste media o caminho de falha achando que media o de sucesso.
 */
let contaDeServico: { client_email: string; private_key: string }

beforeAll(() => {
  cadeia = gerarCadeia()

  const dir = mkdtempSync(join(tmpdir(), 'synse-sa-'))
  execFileSync(
    'openssl',
    ['genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:2048', '-out', 'sa.key'],
    { cwd: dir, stdio: ['ignore', 'ignore', 'ignore'] },
  )
  contaDeServico = {
    client_email: 'robo@teste.iam.gserviceaccount.com',
    private_key: readFileSync(join(dir, 'sa.key'), 'utf8'),
  }
}, 120_000)

const b64 = (valor: object) => Buffer.from(JSON.stringify(valor)).toString('base64url')

function jwsDaApple(extras: Record<string, unknown> = {}) {
  const cabecalho = b64({ alg: 'ES256', x5c: cadeia.x5c })
  const corpo = b64({
    transactionId: '2000000000000001',
    originalTransactionId: '1000000000000001',
    productId: PRODUTO_MENSAL,
    bundleId: APP_ID,
    purchaseDate: Date.now() - 86_400_000,
    expiresDate: Date.now() + 29 * 86_400_000,
    appAccountToken: PERFIL,
    environment: 'Production',
    signedDate: Date.now(),
    ...extras,
  })
  const assinador = createSign('sha256')
  assinador.update(`${cabecalho}.${corpo}`)
  assinador.end()
  const ass = assinador.sign({ key: cadeia.chave, dsaEncoding: 'ieee-p1363' })
  return `${cabecalho}.${corpo}.${ass.toString('base64url')}`
}

const deps = (sobrepor: Partial<Parameters<typeof verificarCompraDaLoja>[0]> = {}) => ({
  loja: 'apple' as const,
  comprovante: jwsDaApple(),
  perfil: PERFIL,
  produtoEsperado: PRODUTO_MENSAL,
  apple: { raizPem: cadeia.raizPem, bundleId: APP_ID, ambientes: ['Production'] as const },
  google: { pacote: APP_ID },
  ...sobrepor,
})

describe('Apple: a compra legítima', () => {
  it('é aceita, com o estado traduzido', async () => {
    const r = await verificarCompraDaLoja(deps())
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.estado.status).toBe('ACTIVE')
      expect(r.estado.refDaLoja).toBe('1000000000000001')
      expect(r.estado.referencia).toBe(PERFIL)
    }
  })
})

describe('o recibo emprestado', () => {
  it('recibo válido de outra conta é recusado', async () => {
    /*
     * **O teste central deste arquivo.** A JWS é legítima, a cadeia é
     * impecável, a assinatura confere — e o `appAccountToken` é de outra
     * pessoa. Sem esta recusa, um recibo publicado num grupo daria Synse+ a
     * todos que o colassem.
     */
    const r = await verificarCompraDaLoja(deps({ perfil: OUTRO_PERFIL }))
    expect(r).toMatchObject({ ok: false, motivo: 'de-outra-conta' })
  })

  it('e recibo sem referência nenhuma também', async () => {
    /*
     * Aceitar "sem referência" abriria o mesmo buraco para todo recibo que a
     * loja mandar incompleto — e nós não controlamos o que ela manda.
     */
    const semToken = jwsDaApple({ appAccountToken: undefined })
    const r = await verificarCompraDaLoja(deps({ comprovante: semToken }))
    expect(r).toMatchObject({ ok: false, motivo: 'de-outra-conta' })
  })
})

describe('o produto', () => {
  it('recibo de outro produto não vira Synse+ por semelhança', async () => {
    const outro = jwsDaApple({ productId: 'synse_plus_anual' })
    const r = await verificarCompraDaLoja(deps({ comprovante: outro }))
    expect(r).toMatchObject({ ok: false, motivo: 'produto-desconhecido' })
  })
})

describe('as duas falhas não podem ser a mesma', () => {
  it('JWS inválida é definitiva', async () => {
    /*
     * `invalido` diz à tela para parar de tentar: aquele comprovante não vale,
     * e nenhuma repetição vai mudar isso.
     */
    const r = await verificarCompraDaLoja(deps({ comprovante: 'nada.disso.presta' }))
    expect(r).toMatchObject({ ok: false, motivo: 'invalido' })
  })

  it('loja fora do ar é temporária', async () => {
    /*
     * E este é o inverso: a compra pode ser boa, e tratar como inválida
     * mandaria a pessoa desistir de uma assinatura que ela pagou. Com
     * `indisponivel`, a tela pode tentar de novo.
     */
    const r = await verificarCompraDaLoja(
      deps({
        loja: 'google',
        comprovante: 'token-abc',
        google: {
          pacote: APP_ID,
          conta: contaDeServico,
          buscar: vi.fn().mockResolvedValue({ ok: false, status: 503 }) as unknown as typeof fetch,
        },
      }),
    )
    expect(r).toMatchObject({ ok: false, motivo: 'indisponivel' })
  })

  it('token que o Google não conhece é definitivo, não "tente de novo"', async () => {
    /*
     * 404 da Play API significa "não existe compra com esse token" — é o caso
     * de alguém mandando um `purchaseToken` inventado para a nossa rota.
     * Classificar como indisponível faria a tela repetir para sempre uma
     * pergunta cuja resposta não vai mudar.
     */
    limparCacheDoToken()
    const buscar = vi.fn(async (url: unknown) =>
      String(url).includes('oauth2.googleapis.com')
        ? { ok: true, status: 200, json: async () => ({ access_token: 'tok', expires_in: 3600 }) }
        : { ok: false, status: 404 },
    ) as unknown as typeof fetch

    const r = await verificarCompraDaLoja(
      deps({
        loja: 'google',
        comprovante: 'token-inventado',
        google: { pacote: APP_ID, conta: contaDeServico, buscar },
      }),
    )
    expect(r).toMatchObject({ ok: false, motivo: 'invalido' })
  })

  it('e sem credencial do Google também é indisponível, não inválido', async () => {
    /*
     * Esquecer a variável de ambiente não pode parecer "o recibo da pessoa é
     * falso". O suporte procuraria no lugar errado.
     */
    const r = await verificarCompraDaLoja(
      deps({ loja: 'google', comprovante: 'token-abc', google: { pacote: APP_ID, conta: null } }),
    )
    expect(r).toMatchObject({ ok: false, motivo: 'indisponivel' })
    if (!r.ok) expect(r.detalhe).toMatch(/conta de serviço/)
  })
})

describe('Google: o caminho feliz, com a API dublada', () => {
  it('consulta o token e traduz o estado', async () => {
    limparCacheDoToken()
    const chamadas: string[] = []
    const buscar = vi.fn(async (url: unknown) => {
      const endereco = String(url)
      chamadas.push(endereco)
      if (endereco.includes('oauth2.googleapis.com')) {
        return { ok: true, status: 200, json: async () => ({ access_token: 'tok', expires_in: 3600 }) }
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
          lineItems: [
            {
              productId: PRODUTO_MENSAL,
              expiryTime: new Date(Date.now() + 29 * 86_400_000).toISOString(),
              autoRenewingPlan: { autoRenewEnabled: true },
            },
          ],
          externalAccountIdentifiers: { obfuscatedExternalAccountId: PERFIL },
        }),
      }
    }) as unknown as typeof fetch

    const r = await verificarCompraDaLoja(
      deps({
        loja: 'google',
        comprovante: 'token-abc',
        google: {
          pacote: APP_ID,
          conta: contaDeServico,
          buscar,
        },
      }),
    )

    expect(r.ok).toBe(true)
    if (r.ok) expect(r.estado.status).toBe('ACTIVE')

    // O token vem antes, e o pacote e o token vão na URL da consulta.
    expect(chamadas[0]).toContain('oauth2.googleapis.com')
    expect(chamadas[1]).toContain(`/applications/${APP_ID}/`)
    expect(chamadas[1]).toContain('/tokens/token-abc')
  })
})

describe('o JWT da conta de serviço', () => {
  /*
   * A única parte do fluxo do Google que dá para conferir sem rede e sem
   * credencial de verdade — e ela tem três detalhes que o Google recusa com
   * `invalid_grant`, uma mensagem que não diz qual deles está errado.
   */
  it('é RS256, com as reivindicações que o Google exige', () => {
    const agora = new Date('2026-10-18T12:00:00Z')
    const [cab, corpo] = montarJwtDaContaDeServico(contaDeServico, agora).split('.')

    expect(JSON.parse(Buffer.from(cab, 'base64url').toString())).toEqual({
      alg: 'RS256',
      typ: 'JWT',
    })

    const lido = JSON.parse(Buffer.from(corpo, 'base64url').toString())
    expect(lido.iss).toBe(contaDeServico.client_email)
    expect(lido.scope).toBe('https://www.googleapis.com/auth/androidpublisher')
    // `aud` tem de ser o endereço do token, não o da API: errar aqui dá
    // `invalid_grant` sem dizer por quê.
    expect(lido.aud).toBe('https://oauth2.googleapis.com/token')
    expect(lido.exp - lido.iat).toBe(3600)
  })

  it('e a assinatura é verificável com a chave pública da conta', () => {
    const jwt = montarJwtDaContaDeServico(contaDeServico)
    const [cab, corpo, ass] = jwt.split('.')
    const v = createVerify('RSA-SHA256')
    v.update(`${cab}.${corpo}`)
    v.end()
    expect(v.verify(createPublicKey(contaDeServico.private_key), Buffer.from(ass, 'base64url'))).toBe(true)
  })
})

describe('a leitura da conta de serviço do ambiente', () => {
  const original = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON

  /*
   * `afterEach` de verdade. A primeira versão tinha uma função chamada no
   * corpo do `describe` com cara de hook — ela rodava uma vez, na coleta, e
   * não restaurava nada. Mexer em `process.env` sem restaurar vaza para os
   * outros arquivos da suíte.
   */
  afterEach(() => {
    if (original === undefined) delete process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON
    else process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = original
  })

  it('ausente devolve nulo, não lança', () => {
    delete process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON
    expect(contaDeServicoDoGoogle()).toBeNull()
  })

  it('JSON quebrado devolve nulo, não lança', () => {
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = '{ isto não é json'
    expect(contaDeServicoDoGoogle()).toBeNull()
  })

  it('JSON válido sem os campos que importam devolve nulo', () => {
    /*
     * Lacuna achada por mutação: eu testava ausência e JSON quebrado, mas não
     * JSON **válido e incompleto** — que é o caso realista de quem colou o
     * objeto errado, ou um recorte dele. Sem a checagem, a conta passaria com
     * `client_email` indefinido e o JWT sairia sem `iss`.
     */
    for (const objeto of [
      {},
      { client_email: 'robo@teste.iam.gserviceaccount.com' },
      { private_key: '-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----' },
      { client_email: '', private_key: 'x' },
    ]) {
      process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = JSON.stringify(objeto)
      expect(contaDeServicoDoGoogle(), JSON.stringify(objeto)).toBeNull()
    }
  })

  it('converte `\\n` literal em quebra de linha', () => {
    /*
     * Quem cola o JSON da conta de serviço numa variável de ambiente da Vercel
     * quase sempre acaba com a chave numa linha só, com `\\n` literal. O
     * OpenSSL recusa o PEM assim, e o erro não menciona quebra de linha.
     */
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = JSON.stringify({
      client_email: 'robo@teste.iam.gserviceaccount.com',
      private_key: '-----BEGIN PRIVATE KEY-----\\nMIIE\\n-----END PRIVATE KEY-----\\n',
    })
    const lida = contaDeServicoDoGoogle()
    expect(lida?.private_key).toContain('\n')
    expect(lida?.private_key).not.toContain('\\n')
  })
})
