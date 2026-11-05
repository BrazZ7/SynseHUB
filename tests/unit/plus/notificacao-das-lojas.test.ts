import { createPrivateKey, createSign } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

import { JwsInvalida } from '@/lib/plans/lojas/apple-jws'
import {
  estadoDaNotificacaoDaApple,
  lerNotificacaoDaApple,
} from '@/lib/plans/lojas/apple-notificacao'
import {
  ehTesteDoGoogle,
  lerNotificacaoDoGoogle,
  NotificacaoInvalida,
  TIPOS_DO_GOOGLE,
} from '@/lib/plans/lojas/google-notificacao'
import { APP_ID, PRODUTO_MENSAL } from '@/lib/plans/lojas/tipos'

/**
 * As notificações das duas lojas.
 *
 * Sem elas, a assinatura fica certa até o fim do primeiro ciclo e errada
 * depois: quem cancela na App Store mantém acesso até a data e **nunca é
 * derrubado**, e quem renova não tem a data empurrada.
 *
 * As duas são autenticadas de formas opostas, e os testes refletem isso: a da
 * Apple é uma JWS, e aqui ela é gerada com cadeia de verdade; a do Google não
 * tem assinatura nenhuma, e o que se testa é que o corpo **não decide** nada.
 */

const PERFIL = '11111111-1111-1111-1111-111111111111'

// ── Cadeia de teste, igual à dos outros arquivos ────────────────────────────

type Cadeia = { raizPem: string; x5c: string[]; chave: ReturnType<typeof createPrivateKey> }

function gerarCadeia(): Cadeia {
  const dir = mkdtempSync(join(tmpdir(), 'synse-notif-'))
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
 * O "agora" dos testes, calculado **depois** de a cadeia existir.
 *
 * Com uma constante fixa no topo do arquivo, os certificados nasciam com
 * `validFrom` depois dela — eles são gerados no `beforeAll`, que roda após a
 * avaliação do módulo — e toda verificação falhava com "ainda não é válido".
 * Um segundo de folga cobre a diferença de relógio entre gerar e verificar.
 */
let AGORA: Date

beforeAll(() => {
  cadeia = gerarCadeia()
  AGORA = new Date(Date.now() + 1_000)
}, 60_000)

const b64 = (v: object) => Buffer.from(JSON.stringify(v)).toString('base64url')

function assinar(corpo: object) {
  const cab = b64({ alg: 'ES256', x5c: cadeia.x5c })
  const payload = b64(corpo)
  const s = createSign('sha256')
  s.update(`${cab}.${payload}`)
  s.end()
  return `${cab}.${payload}.${s.sign({ key: cadeia.chave, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`
}

const daquiA = (dias: number) => AGORA.getTime() + dias * 86_400_000
const haviaDias = (dias: number) => AGORA.getTime() - dias * 86_400_000

function transacao(extras: Record<string, unknown> = {}) {
  return assinar({
    transactionId: '2000000000000002',
    originalTransactionId: '1000000000000001',
    productId: PRODUTO_MENSAL,
    bundleId: APP_ID,
    purchaseDate: haviaDias(1),
    expiresDate: daquiA(29),
    appAccountToken: PERFIL,
    environment: 'Production',
    signedDate: AGORA.getTime(),
    ...extras,
  })
}

function envelope(extras: Record<string, unknown> = {}, dados: Record<string, unknown> = {}) {
  return assinar({
    notificationType: 'DID_RENEW',
    notificationUUID: 'uuid-da-notificacao-1',
    version: '2.0',
    signedDate: AGORA.getTime(),
    data: {
      bundleId: APP_ID,
      environment: 'Production',
      signedTransactionInfo: transacao(),
      ...dados,
    },
    ...extras,
  })
}

const opcoes = () => ({
  raizPem: cadeia.raizPem,
  bundleId: APP_ID,
  ambientes: ['Production'] as const,
  agora: AGORA,
})

describe('a notificação da Apple', () => {
  it('é lida quando a cadeia confere', () => {
    const lida = lerNotificacaoDaApple(envelope(), opcoes())
    expect(lida.tipo).toBe('DID_RENEW')
    expect(lida.uuid).toBe('uuid-da-notificacao-1')
    expect(lida.transacao.productId).toBe(PRODUTO_MENSAL)
  })

  it('e a transação de dentro passa pela verificação completa', () => {
    /*
     * O envelope só transporta; o documento que concede acesso é a transação.
     * Uma transação de outro app dentro de um envelope legítimo tem de ser
     * recusada — e é esta linha que separa "o envelope é da Apple" de "a
     * compra é do Synse".
     */
    const deOutroApp = envelope({}, { signedTransactionInfo: transacao({ bundleId: 'com.outro' }) })
    expect(() => lerNotificacaoDaApple(deOutroApp, opcoes())).toThrow(/não é br\.com\.synse\.app/)
  })

  it('envelope de outro app é recusado pelo `data.bundleId`', () => {
    /*
     * O bundle id do envelope mora em `data`, não no topo — e é por isso que
     * `verificarJwsDaApple` não serve para ele: ela o procura na raiz do corpo
     * e recusaria **toda** notificação legítima.
     */
    const outro = envelope({}, { bundleId: 'com.outra.empresa' })
    expect(() => lerNotificacaoDaApple(outro, opcoes())).toThrow(/de outro app/)
  })

  it('ambiente de teste é recusado quando só produção é aceita', () => {
    const sandbox = assinar({
      notificationType: 'DID_RENEW',
      notificationUUID: 'u2',
      signedDate: AGORA.getTime(),
      data: { bundleId: APP_ID, environment: 'Sandbox', signedTransactionInfo: transacao() },
    })
    expect(() => lerNotificacaoDaApple(sandbox, opcoes())).toThrow(/ambiente "Sandbox"/)
  })

  it.each([
    ['sem data', { notificationType: 'X', notificationUUID: 'u' }],
    ['sem uuid', { notificationType: 'X', data: { bundleId: APP_ID, environment: 'Production' } }],
    ['sem tipo', { notificationUUID: 'u', data: { bundleId: APP_ID, environment: 'Production' } }],
  ])('%s é recusada', (_nome, corpo) => {
    expect(() => lerNotificacaoDaApple(assinar(corpo), opcoes())).toThrow(JwsInvalida)
  })

  it('notificação sem transação é recusada — é o caso do TEST', () => {
    const teste = assinar({
      notificationType: 'TEST',
      notificationUUID: 'u-teste',
      signedDate: AGORA.getTime(),
      data: { bundleId: APP_ID, environment: 'Production' },
    })
    expect(() => lerNotificacaoDaApple(teste, opcoes())).toThrow(/sem signedTransactionInfo/)
  })
})

describe('a informação de renovação', () => {
  it('`autoRenewStatus: 0` torna a assinatura CANCELED', () => {
    /*
     * **A razão de a notificação existir.** A transação diz "vale até tal dia"
     * e nada sobre o futuro: quem cancelou aparece como ACTIVE até a data.
     * Sem isto, a tela lê "renova em 29 dias" para quem já cancelou, e a
     * previsão de receita conta um mês que não vem.
     */
    const cancelada = envelope(
      { notificationType: 'DID_CHANGE_RENEWAL_STATUS' },
      { signedRenewalInfo: assinar({ autoRenewStatus: 0, productId: PRODUTO_MENSAL }) },
    )
    const lida = lerNotificacaoDaApple(cancelada, opcoes())
    expect(lida.renovaAutomaticamente).toBe(false)

    const estado = estadoDaNotificacaoDaApple(lida, AGORA)
    expect(estado.status).toBe('CANCELED')
    // E o acesso continua até o fim do que já foi pago.
    expect(estado.until).toBe(new Date(daquiA(29)).toISOString())
  })

  it('`autoRenewStatus: 1` mantém ACTIVE', () => {
    const ativa = envelope({}, { signedRenewalInfo: assinar({ autoRenewStatus: 1 }) })
    const lida = lerNotificacaoDaApple(ativa, opcoes())
    expect(lida.renovaAutomaticamente).toBe(true)
    expect(estadoDaNotificacaoDaApple(lida, AGORA).status).toBe('ACTIVE')
  })

  it('ausente fica nulo, e não assume que renova', () => {
    /*
     * Assumir `true` é assumir receita que pode não vir, e põe "renova em" na
     * tela de quem talvez tenha cancelado. Nulo deixa o estado como a
     * transação diz, sem inventar.
     */
    const lida = lerNotificacaoDaApple(envelope(), opcoes())
    expect(lida.renovaAutomaticamente).toBeNull()
    expect(estadoDaNotificacaoDaApple(lida, AGORA).status).toBe('ACTIVE')
  })

  it('presente mas sem `autoRenewStatus` também fica nulo', () => {
    /*
     * Lacuna achada por mutação: eu testava o bloco **ausente**, não o bloco
     * presente com o campo faltando — que é o caso em que `status !== 0`
     * devolveria `true` e a tela diria "renova em" para quem talvez tenha
     * cancelado.
     */
    const semCampo = envelope({}, { signedRenewalInfo: assinar({ productId: PRODUTO_MENSAL }) })
    expect(lerNotificacaoDaApple(semCampo, opcoes()).renovaAutomaticamente).toBeNull()
  })

  it('e valor que a Apple não documenta também fica nulo', () => {
    // Só 0 e 1 existem hoje. Um 2 futuro não pode ser lido como "renova".
    const estranho = envelope({}, { signedRenewalInfo: assinar({ autoRenewStatus: 2 }) })
    expect(lerNotificacaoDaApple(estranho, opcoes()).renovaAutomaticamente).toBeNull()
  })

  it('e renovação desligada não ressuscita assinatura vencida', () => {
    // CANCELED exige prazo no futuro; vencida é EXPIRED, e `set_plus_subscription`
    // recusaria CANCELED sem data de qualquer forma.
    const vencida = envelope(
      {},
      {
        signedTransactionInfo: transacao({ expiresDate: haviaDias(1) }),
        signedRenewalInfo: assinar({ autoRenewStatus: 0 }),
      },
    )
    const estado = estadoDaNotificacaoDaApple(lerNotificacaoDaApple(vencida, opcoes()), AGORA)
    expect(estado).toMatchObject({ status: 'EXPIRED', until: null })
  })
})

describe('estorno e revogação', () => {
  it.each(['REFUND', 'REVOKE'])('%s derruba o acesso', (tipo) => {
    /*
     * O estorno já cairia em EXPIRED por `revocationDate`, mas não dá para
     * depender de um sinal só quando o tipo da notificação diz a mesma coisa —
     * e REVOKE (compartilhamento familiar retirado) **não** tem
     * `revocationDate`.
     */
    const lida = lerNotificacaoDaApple(envelope({ notificationType: tipo }), opcoes())
    expect(estadoDaNotificacaoDaApple(lida, AGORA)).toMatchObject({
      status: 'EXPIRED',
      until: null,
    })
  })
})

describe('o horário do evento', () => {
  it('vem do envelope, não da transação', () => {
    /*
     * Numa renovação a Apple reassina a transação com data nova, mas é o
     * envelope que marca quando **este fato** aconteceu. É o horário que a
     * regra 1 da 0061 compara para descartar reenvio fora de ordem.
     */
    const comDatas = envelope(
      { signedDate: daquiA(1) },
      { signedTransactionInfo: transacao({ signedDate: haviaDias(5) }) },
    )
    const estado = estadoDaNotificacaoDaApple(lerNotificacaoDaApple(comDatas, opcoes()), AGORA)
    expect(estado.eventoEm).toBe(new Date(daquiA(1)).toISOString())
  })
})

// ── Google ─────────────────────────────────────────────────────────────────

const pubsub = (mensagem: object, extras: Record<string, unknown> = {}) => ({
  message: {
    data: Buffer.from(JSON.stringify(mensagem)).toString('base64'),
    messageId: 'msg-1',
    publishTime: AGORA.toISOString(),
    ...extras,
  },
  subscription: 'projects/synse/subscriptions/rtdn',
})

describe('a notificação do Google', () => {
  it('é lida do envelope do Pub/Sub', () => {
    const lida = lerNotificacaoDoGoogle(
      pubsub({
        version: '1.0',
        packageName: APP_ID,
        eventTimeMillis: String(AGORA.getTime()),
        subscriptionNotification: {
          version: '1.0',
          notificationType: 3,
          purchaseToken: 'token-abc',
          subscriptionId: PRODUTO_MENSAL,
        },
      }),
    )

    expect(lida).toMatchObject({
      pacote: APP_ID,
      purchaseToken: 'token-abc',
      produto: PRODUTO_MENSAL,
      tipo: 3,
      messageId: 'msg-1',
      eventoEm: AGORA.toISOString(),
    })
    expect(TIPOS_DO_GOOGLE[lida.tipo]).toBe('CANCELED')
  })

  it('`eventTimeMillis` ausente vira nulo, não data inválida', () => {
    /*
     * `Number(undefined)` é `NaN`, e `new Date(NaN).toISOString()` **estoura**.
     * Um campo que o Google um dia pare de mandar não pode derrubar a rota.
     */
    const lida = lerNotificacaoDoGoogle(
      pubsub({
        packageName: APP_ID,
        subscriptionNotification: { notificationType: 2, purchaseToken: 't' },
      }),
    )
    expect(lida.eventoEm).toBeNull()
  })

  it.each([
    ['envelope vazio', {}],
    ['sem message.data', { message: { messageId: 'm' } }],
    ['data que não é base64 de JSON', { message: { data: 'não-json', messageId: 'm' } }],
  ])('%s é recusado', (_nome, corpo) => {
    expect(() => lerNotificacaoDoGoogle(corpo)).toThrow(NotificacaoInvalida)
  })

  it('mensagem que não é de assinatura é recusada', () => {
    /*
     * O Google manda compra única e compra anulada no **mesmo tópico**.
     * Tratá-las como assinatura produziria uma consulta a um token que não é
     * de assinatura, e a resposta seria lida como "sem acesso" — derrubando
     * quem paga.
     */
    const compraUnica = pubsub({
      packageName: APP_ID,
      oneTimeProductNotification: { purchaseToken: 't', sku: 'outra-coisa' },
    })
    expect(() => lerNotificacaoDoGoogle(compraUnica)).toThrow(/sem subscriptionNotification/)
  })

  it('sem purchaseToken é recusada — é ele que se pergunta ao Google', () => {
    const sem = pubsub({
      packageName: APP_ID,
      subscriptionNotification: { notificationType: 2 },
    })
    expect(() => lerNotificacaoDoGoogle(sem)).toThrow(/sem purchaseToken/)
  })

  it('a notificação de teste do painel é reconhecida', () => {
    const teste = pubsub({ version: '1.0', packageName: APP_ID, testNotification: { version: '1.0' } })
    expect(ehTesteDoGoogle(teste)).toBe(true)
    // E não é confundida com uma de assinatura.
    expect(ehTesteDoGoogle(pubsub({ packageName: APP_ID, subscriptionNotification: {} }))).toBe(false)
  })

  it('e envelope quebrado não faz `ehTesteDoGoogle` estourar', () => {
    for (const corpo of [null, {}, { message: { data: 'xxx' } }]) {
      expect(ehTesteDoGoogle(corpo)).toBe(false)
    }
  })
})
