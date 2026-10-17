import { createPrivateKey, createSign, X509Certificate, type KeyObject } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

import { JwsInvalida, verificarJwsDaApple } from '@/lib/plans/lojas/apple-jws'

/**
 * ── A verificação da transação da App Store, contra cadeias de verdade ───────
 *
 * Errar aqui não falha: **libera**. Uma JWS aceita indevidamente é Synse+ de
 * graça para quem souber montar três base64.
 *
 * Então estes testes não usam dublê nem recibo de exemplo colado de um blog.
 * Eles geram uma cadeia EC P-256 real — raiz, intermediária, folha — com
 * OpenSSL, assinam uma JWS com a chave da folha, e verificam que a função
 * aceita essa e recusa cada falsificação possível.
 *
 * O que **não** está coberto, e é importante dizer: nenhuma JWS da Apple de
 * verdade passou por aqui. A estrutura é a documentada; se a Apple mudar um
 * campo, o primeiro recibo real é que vai dizer. O que está provado é a
 * lógica: raiz fixada, cadeia conferida, assinatura conferida, e as recusas.
 */

type Cadeia = {
  raizPem: string
  x5c: string[]
  chaveDaFolha: KeyObject
  /** Onde os arquivos ficaram, para quem precisar forjar a partir deles. */
  dir: string
}

const BUNDLE = 'br.com.synse.app'

/** Gera raiz → intermediária → folha, com OpenSSL, numa pasta temporária. */
function gerarCadeia(opcoes: { validadeDias?: number; raizPropria?: boolean } = {}): Cadeia {
  const dir = mkdtempSync(join(tmpdir(), 'synse-jws-'))
  const dias = opcoes.validadeDias ?? 365
  // `stdio` silenciado: o OpenSSL escreve "Certificate request self-signature
  // ok" em stderr a cada certificado, e vinte linhas disso escondem o
  // resultado dos testes.
  const ossl = (args: string[]) =>
    execFileSync('openssl', args, { cwd: dir, stdio: ['ignore', 'ignore', 'ignore'] })

  const chave = (nome: string) =>
    ossl(['ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', `${nome}.key`])

  chave('raiz')
  chave('inter')
  chave('folha')

  // Raiz autoassinada, com basicConstraints de CA — sem isso `checkIssued`
  // ainda passa, mas um verificador sério não deveria aceitar, e o nosso
  // confere a igualdade byte a byte com a raiz fixada de qualquer forma.
  writeFileSync(join(dir, 'ca.cnf'), 'basicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign\n')
  writeFileSync(join(dir, 'folha.cnf'), 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\n')

  /*
   * `-addext` e não `-extfile`: `openssl req` não aceita `-extfile` (só
   * `x509 -req` aceita), e o erro que ele devolve é "Use -help for summary",
   * que não diz qual opção está sobrando.
   */
  ossl([
    'req', '-new', '-x509', '-key', 'raiz.key', '-out', 'raiz.crt',
    '-days', String(dias), '-subj', '/CN=Raiz de Teste/O=Synse Teste',
    '-addext', 'basicConstraints=critical,CA:TRUE',
    '-addext', 'keyUsage=critical,keyCertSign',
  ])

  for (const [nome, emissorKey, emissorCrt, cnf, assunto] of [
    ['inter', 'raiz.key', 'raiz.crt', 'ca.cnf', '/CN=Intermediaria de Teste'],
    ['folha', 'inter.key', 'inter.crt', 'folha.cnf', '/CN=Folha de Teste'],
  ] as const) {
    ossl(['req', '-new', '-key', `${nome}.key`, '-out', `${nome}.csr`, '-subj', assunto])
    ossl([
      'x509', '-req', '-in', `${nome}.csr`, '-CA', emissorCrt, '-CAkey', emissorKey,
      '-CAcreateserial', '-out', `${nome}.crt`, '-days', String(dias), '-extfile', cnf,
    ])
  }

  const der = (nome: string) =>
    readFileSync(join(dir, `${nome}.crt`), 'utf8')
      .replace(/-----[A-Z ]+-----/g, '')
      .replace(/\s+/g, '')

  return {
    raizPem: readFileSync(join(dir, 'raiz.crt'), 'utf8'),
    x5c: [der('folha'), der('inter'), der('raiz')],
    chaveDaFolha: createPrivateKey(readFileSync(join(dir, 'folha.key'), 'utf8')),
    dir,
  }
}

/**
 * Forja uma folha que **diz** ter sido emitida pela intermediária legítima.
 *
 * É o caso que isola `certificado.verify(...)`, e ele existe porque um mutante
 * sobreviveu: removi a verificação de assinatura dos elos e nenhum teste caiu.
 * O motivo é que `checkIssued` do OpenSSL compara nome **e identificador de
 * chave**, e nas cadeias cruzadas simples isso já bastava para recusar.
 *
 * Aqui a CA impostora nasce com o **mesmo nome e o mesmo
 * subjectKeyIdentifier** da intermediária de verdade. Então a folha forjada
 * passa por `checkIssued` — nome bate, identificador bate — e só a conferência
 * da assinatura percebe que quem assinou foi outra chave.
 *
 * É também o ataque real: alguém que consiga emitir um certificado se dizendo
 * assinado pela intermediária da Apple.
 */
function forjarFolhaQueSeDizDaCadeia(cadeia: Cadeia): { x5c: string[]; chave: KeyObject } {
  const dir = cadeia.dir
  const ossl = (args: string[]) =>
    execFileSync('openssl', args, { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] }).toString()

  const assuntoDaInter = ossl(['x509', '-in', 'inter.crt', '-noout', '-subject'])
    .replace(/^subject=\s*/, '')
    .trim()
    .split(/\s*,\s*/)
    .map((parte) => parte.replace(/\s*=\s*/, '='))
    .join('/')

  const ski = ossl(['x509', '-in', 'inter.crt', '-noout', '-ext', 'subjectKeyIdentifier'])
    .split('\n')
    .map((l) => l.trim())
    .find((l) => /^[0-9A-F]{2}(:[0-9A-F]{2})+$/i.test(l))

  if (!ski) throw new Error('não achei o subjectKeyIdentifier da intermediária')

  ossl(['ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', 'impostora.key'])
  ossl([
    'req', '-new', '-x509', '-key', 'impostora.key', '-out', 'impostora.crt',
    '-days', '365', '-subj', `/${assuntoDaInter}`,
    '-addext', 'basicConstraints=critical,CA:TRUE',
    '-addext', 'keyUsage=critical,keyCertSign',
    // O mesmo identificador da intermediária legítima: é o que faz
    // `checkIssued` aceitar.
    '-addext', `subjectKeyIdentifier=${ski}`,
  ])

  ossl(['ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', 'forjada.key'])
  ossl(['req', '-new', '-key', 'forjada.key', '-out', 'forjada.csr', '-subj', '/CN=Folha Forjada'])
  writeFileSync(
    join(dir, 'forjada.cnf'),
    'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nauthorityKeyIdentifier=keyid\n',
  )
  ossl([
    'x509', '-req', '-in', 'forjada.csr', '-CA', 'impostora.crt', '-CAkey', 'impostora.key',
    '-CAcreateserial', '-out', 'forjada.crt', '-days', '365', '-extfile', 'forjada.cnf',
  ])

  const der = (nome: string) =>
    readFileSync(join(dir, `${nome}.crt`), 'utf8')
      .replace(/-----[A-Z ]+-----/g, '')
      .replace(/\s+/g, '')

  return {
    // A folha forjada, e daí em diante a cadeia **legítima**.
    x5c: [der('forjada'), cadeia.x5c[1], cadeia.x5c[2]],
    chave: createPrivateKey(readFileSync(join(dir, 'forjada.key'), 'utf8')),
  }
}

const base64url = (valor: object | string) =>
  Buffer.from(typeof valor === 'string' ? valor : JSON.stringify(valor)).toString('base64url')

/** Monta e assina uma JWS, do jeito que a Apple monta. */
function assinar(
  cadeia: Cadeia,
  corpo: Record<string, unknown>,
  ajustes: { alg?: string; x5c?: string[]; assinaturaCrua?: string } = {},
) {
  const cabecalho = base64url({ alg: ajustes.alg ?? 'ES256', x5c: ajustes.x5c ?? cadeia.x5c })
  const payload = base64url(corpo)

  if (ajustes.assinaturaCrua !== undefined) return `${cabecalho}.${payload}.${ajustes.assinaturaCrua}`

  const assinador = createSign('sha256')
  assinador.update(`${cabecalho}.${payload}`)
  assinador.end()
  const assinatura = assinador.sign({ key: cadeia.chaveDaFolha, dsaEncoding: 'ieee-p1363' })
  return `${cabecalho}.${payload}.${assinatura.toString('base64url')}`
}

const transacao = (extras: Record<string, unknown> = {}) => ({
  transactionId: '2000000000000001',
  originalTransactionId: '2000000000000001',
  productId: 'synse_plus_mensal',
  bundleId: BUNDLE,
  purchaseDate: Date.now(),
  expiresDate: Date.now() + 30 * 86_400_000,
  appAccountToken: '11111111-1111-1111-1111-111111111111',
  type: 'Auto-Renewable Subscription',
  environment: 'Production',
  signedDate: Date.now(),
  ...extras,
})

let cadeia: Cadeia
let outra: Cadeia

beforeAll(() => {
  cadeia = gerarCadeia()
  // Uma segunda cadeia, completa e válida, assinada por **outra** raiz: é o
  // ataque principal, e sem a raiz fixada ela passaria.
  outra = gerarCadeia()
}, 60_000)

const opcoes = () => ({
  raizPem: cadeia.raizPem,
  bundleId: BUNDLE,
  ambientes: ['Production'] as const,
})

describe('a JWS legítima', () => {
  it('é aceita, e o corpo volta tipado', () => {
    const lido = verificarJwsDaApple(assinar(cadeia, transacao()), opcoes())
    expect(lido.productId).toBe('synse_plus_mensal')
    expect(lido.appAccountToken).toBe('11111111-1111-1111-1111-111111111111')
    expect(lido.transactionId).toBe('2000000000000001')
  })
})

describe('a raiz fixada é o que dá valor ao resto', () => {
  it('cadeia completa e válida de outra raiz é recusada', () => {
    /*
     * **O teste mais importante deste arquivo.** A cadeia vem dentro da JWS:
     * sem comparar o último certificado com a raiz fixada, qualquer pessoa
     * gera a própria raiz, assina a própria folha, e monta uma transação
     * dizendo o que quiser. A assinatura confere — com o certificado dela.
     */
    const forjada = assinar(outra, transacao())
    expect(() => verificarJwsDaApple(forjada, opcoes())).toThrow(/não termina na raiz fixada/)
  })

  it('folha forjada que passa por `checkIssued` é pega pela assinatura', () => {
    /*
     * O teste que faltava. Nome e identificador de chave batendo, cadeia
     * legítima da intermediária para cima — e assinada por outra chave.
     * Só a conferência de assinatura de cada elo percebe.
     */
    const forjada = forjarFolhaQueSeDizDaCadeia(cadeia)
    const jws = assinar(
      { ...cadeia, x5c: forjada.x5c, chaveDaFolha: forjada.chave },
      transacao(),
    )
    expect(() => verificarJwsDaApple(jws, opcoes())).toThrow(/não confere com x5c\[1\]/)
  })

  it('e trocar só a raiz do x5c, mantendo o resto, também é recusado', () => {
    // Agora o x5c termina na raiz certa, mas a intermediária não foi emitida
    // por ela. É o elo do meio que pega.
    const misturada = assinar(outra, transacao(), {
      x5c: [outra.x5c[0], outra.x5c[1], cadeia.x5c[2]],
    })
    expect(() => verificarJwsDaApple(misturada, opcoes())).toThrow(JwsInvalida)
  })
})

describe('o cabeçalho não decide nada', () => {
  it('`alg: none` é recusado antes de qualquer conta', () => {
    /*
     * O clássico das bibliotecas de JWT: confiar no `alg` do cabeçalho, que é
     * parte do dado não confiável. Com `none`, a assinatura é vazia e a
     * verificação "passa".
     */
    const semAssinatura = assinar(cadeia, transacao(), { alg: 'none', assinaturaCrua: '' })
    expect(() => verificarJwsDaApple(semAssinatura, opcoes())).toThrow(/não é ES256/)
  })

  it('e trocar para HS256 também', () => {
    // A outra metade do mesmo ataque: algoritmo simétrico, com a chave pública
    // do certificado fazendo papel de segredo.
    const trocado = assinar(cadeia, transacao(), { alg: 'HS256' })
    expect(() => verificarJwsDaApple(trocado, opcoes())).toThrow(/não é ES256/)
  })

  it('x5c ausente é recusado', () => {
    const cabecalho = base64url({ alg: 'ES256' })
    const corpo = base64url(transacao())
    expect(() => verificarJwsDaApple(`${cabecalho}.${corpo}.aaaa`, opcoes())).toThrow(/x5c ausente/)
  })
})

describe('o corpo não pode ser alterado', () => {
  it('mexer no corpo depois de assinar é recusado', () => {
    const legitima = assinar(cadeia, transacao())
    const [cab, , ass] = legitima.split('.')
    const adulterada = `${cab}.${base64url(
      transacao({ expiresDate: Date.now() + 3650 * 86_400_000 }),
    )}.${ass}`

    // Dez anos de Synse+ por uma edição de texto, se a assinatura não fosse
    // conferida sobre `cabeçalho.corpo`.
    expect(() => verificarJwsDaApple(adulterada, opcoes())).toThrow(/assinatura não confere/)
  })
})

describe('o que o corpo precisa dizer', () => {
  it('transação de outro aplicativo é recusada', () => {
    /*
     * Assinada pela Apple de verdade, cadeia impecável — e de outro app.
     * Sem esta linha, qualquer compra da App Store viraria Synse+.
     */
    const deOutroApp = assinar(cadeia, transacao({ bundleId: 'com.outra.empresa' }))
    expect(() => verificarJwsDaApple(deOutroApp, opcoes())).toThrow(/não é br\.com\.synse\.app/)
  })

  it('ambiente de teste é recusado quando só produção é aceita', () => {
    /*
     * Conta de sandbox da Apple é grátis e ilimitada. Aceitar `Sandbox` em
     * produção é Synse+ de graça para quem tiver uma — e não apareceria em
     * relatório de receita nenhum.
     */
    const sandbox = assinar(cadeia, transacao({ environment: 'Sandbox' }))
    expect(() => verificarJwsDaApple(sandbox, opcoes())).toThrow(/ambiente "Sandbox"/)
  })

  it('e é aceito quando o chamador aceita os dois — é o caso do TestFlight', () => {
    const sandbox = assinar(cadeia, transacao({ environment: 'Sandbox' }))
    expect(
      verificarJwsDaApple(sandbox, { ...opcoes(), ambientes: ['Production', 'Sandbox'] }).environment,
    ).toBe('Sandbox')
  })

  it('ambiente ausente é recusado, não assumido', () => {
    const sem = assinar(cadeia, transacao({ environment: undefined }))
    expect(() => verificarJwsDaApple(sem, opcoes())).toThrow(/ambiente/)
  })

  it('corpo sem transactionId é recusado', () => {
    const sem = assinar(cadeia, transacao({ transactionId: '' }))
    expect(() => verificarJwsDaApple(sem, opcoes())).toThrow(/sem transactionId/)
  })
})

describe('certificado fora da validade', () => {
  it('cadeia expirada é recusada', () => {
    /*
     * `-days -1` não existe no OpenSSL, então a cadeia é gerada com validade
     * de um dia e a verificação é feita com a data no futuro — que é o mesmo
     * fato visto do outro lado.
     */
    const curta = gerarCadeia({ validadeDias: 1 })
    const jws = assinar(curta, transacao())
    expect(() =>
      verificarJwsDaApple(jws, {
        raizPem: curta.raizPem,
        bundleId: BUNDLE,
        ambientes: ['Production'],
        agora: new Date(Date.now() + 10 * 86_400_000),
      }),
    ).toThrow(/expirado/)
  })

  it('e cadeia que ainda não começou a valer também', () => {
    /*
     * A outra ponta da janela de validade, e ela não tinha teste: o mutante
     * que removia a conferência de `validFrom` sobreviveu. Certificado com
     * data de início no futuro é relógio errado ou cadeia fabricada — nos dois
     * casos, não é hora de liberar acesso.
     */
    const jws = assinar(cadeia, transacao())
    expect(() =>
      verificarJwsDaApple(jws, {
        ...opcoes(),
        agora: new Date(Date.now() - 10 * 86_400_000),
      }),
    ).toThrow(/ainda não é válido/)
  })
})

describe('entrada malformada', () => {
  it.each([
    ['vazia', ''],
    ['sem pontos', 'abcdef'],
    ['com duas partes', 'aaa.bbb'],
    ['com quatro partes', 'aaa.bbb.ccc.ddd'],
    ['cabeçalho que não é base64 de JSON', 'nao-json.bbb.ccc'],
  ])('%s é recusada sem estourar', (_nome, entrada) => {
    expect(() => verificarJwsDaApple(entrada, opcoes())).toThrow(JwsInvalida)
  })
})

describe('a raiz fixada no repositório', () => {
  it('é a Apple Root CA - G3, com a impressão digital documentada', () => {
    /*
     * O arquivo é fixado e o teste é o que torna a troca visível. Sem isto,
     * substituir `apple-raiz.pem` por outra raiz seria uma linha de diff que
     * ninguém nota — e passa a aceitar cadeia de quem emitiu aquela.
     */
    const pem = readFileSync(join(process.cwd(), 'src/lib/plans/lojas/apple-raiz.pem'), 'utf8')
    const certificado = new X509Certificate(pem.slice(pem.indexOf('-----BEGIN')))

    expect(certificado.subject).toContain('Apple Root CA - G3')
    expect(certificado.fingerprint256).toBe(
      '63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79',
    )
    // E continua válida: raiz expirada faria toda compra ser recusada.
    expect(new Date(certificado.validTo).getTime()).toBeGreaterThan(Date.now())
  })
})
