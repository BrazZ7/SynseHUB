import { describe, expect, it } from 'vitest'

import {
  estadoDaApple,
  estadoDoGoogle,
  type AssinaturaDoGoogle,
} from '@/lib/plans/lojas/estado'
import type { TransacaoDaApple } from '@/lib/plans/lojas/apple-jws'

/**
 * A tradução do estado de cada loja para o estado da conta.
 *
 * Os dois erros possíveis custam coisas diferentes, e o código escolheu de
 * propósito para que lado errar:
 *
 *   - derrubar quem paga → aborrecimento, o suporte resolve, e a notificação
 *     seguinte da loja corrige sozinha;
 *   - liberar quem não paga → ninguém descobre, ninguém corrige.
 *
 * Por isso todo estado desconhecido cai em `EXPIRED`. Estes testes existem
 * para que a escolha continue sendo essa quando alguém mexer aqui.
 */

const AGORA = new Date('2026-10-17T12:00:00Z')
const DIA = 86_400_000
const daquiA = (dias: number) => AGORA.getTime() + dias * DIA
const haviaDias = (dias: number) => AGORA.getTime() - dias * DIA

const daApple = (extras: Partial<TransacaoDaApple> & { offerType?: number } = {}) =>
  ({
    transactionId: '2000000000000001',
    originalTransactionId: '1000000000000001',
    productId: 'synse_plus_mensal',
    bundleId: 'br.com.synse.app',
    purchaseDate: haviaDias(1),
    expiresDate: daquiA(29),
    appAccountToken: '11111111-1111-1111-1111-111111111111',
    environment: 'Production',
    signedDate: haviaDias(0),
    ...extras,
  }) as TransacaoDaApple

describe('Apple', () => {
  it('assinatura dentro do prazo dá ACTIVE, com a data da loja', () => {
    const estado = estadoDaApple(daApple(), AGORA)
    expect(estado).toMatchObject({
      status: 'ACTIVE',
      until: new Date(daquiA(29)).toISOString(),
      referencia: '11111111-1111-1111-1111-111111111111',
      produto: 'synse_plus_mensal',
    })
  })

  it('usa o `originalTransactionId` como referência da loja', () => {
    /*
     * E não o `transactionId`: o primeiro é estável por toda a vida da
     * assinatura, o segundo muda a cada renovação. Guardar o que muda faria
     * cada mês parecer uma assinatura nova.
     */
    expect(estadoDaApple(daApple(), AGORA).refDaLoja).toBe('1000000000000001')
  })

  it('oferta introdutória dá TRIAL', () => {
    expect(estadoDaApple(daApple({ offerType: 1 }), AGORA).status).toBe('TRIAL')
  })

  it('estorno derruba o acesso, mesmo com a data no futuro', () => {
    /*
     * O caso que uma ordem de checagem errada deixa passar: o reembolso não
     * reescreve `expiresDate`, que continua apontando para o fim do ciclo.
     * Olhar a data antes do estorno dá acesso a quem recebeu o dinheiro de
     * volta.
     */
    const estornada = daApple({ revocationDate: haviaDias(1), expiresDate: daquiA(29) })
    expect(estadoDaApple(estornada, AGORA)).toMatchObject({ status: 'EXPIRED', until: null })
  })

  it('data vencida dá EXPIRED', () => {
    expect(estadoDaApple(daApple({ expiresDate: haviaDias(1) }), AGORA).status).toBe('EXPIRED')
  })

  it('transação sem data de fim dá EXPIRED, não acesso sem prazo', () => {
    // Compra que não é assinatura, ou campo ausente. Sem prazo, a 0061 recusa
    // de qualquer forma — e aqui já não se pede acesso.
    expect(estadoDaApple(daApple({ expiresDate: undefined }), AGORA).status).toBe('EXPIRED')
  })

  it('leva o `signedDate` como horário do evento, para a regra 1 da 0061', () => {
    const estado = estadoDaApple(daApple({ signedDate: haviaDias(2) }), AGORA)
    expect(estado.eventoEm).toBe(new Date(haviaDias(2)).toISOString())
  })

  it('e sem `appAccountToken` a referência é nula, não inventada', () => {
    expect(estadoDaApple(daApple({ appAccountToken: undefined }), AGORA).referencia).toBeNull()
  })
})

const doGoogle = (estado: string, extras: Partial<AssinaturaDoGoogle> = {}): AssinaturaDoGoogle => ({
  subscriptionState: estado,
  lineItems: [
    {
      productId: 'synse_plus_mensal',
      expiryTime: new Date(daquiA(29)).toISOString(),
      autoRenewingPlan: { autoRenewEnabled: true },
    },
  ],
  externalAccountIdentifiers: {
    obfuscatedExternalAccountId: '22222222-2222-2222-2222-222222222222',
  },
  ...extras,
})

const opcoes = { purchaseToken: 'token-abc', agora: AGORA }

describe('Google', () => {
  it('ACTIVE dá ACTIVE', () => {
    expect(estadoDoGoogle(doGoogle('SUBSCRIPTION_STATE_ACTIVE'), opcoes)).toMatchObject({
      status: 'ACTIVE',
      until: new Date(daquiA(29)).toISOString(),
      referencia: '22222222-2222-2222-2222-222222222222',
      refDaLoja: 'token-abc',
    })
  })

  it('ACTIVE com renovação desligada dá CANCELED — é cancelamento que não venceu', () => {
    const cancelando = doGoogle('SUBSCRIPTION_STATE_ACTIVE', {
      lineItems: [
        {
          productId: 'synse_plus_mensal',
          expiryTime: new Date(daquiA(10)).toISOString(),
          autoRenewingPlan: { autoRenewEnabled: false },
        },
      ],
    })
    expect(estadoDoGoogle(cancelando, opcoes).status).toBe('CANCELED')
  })

  it('carência mantém o acesso — cartão recusado não é inadimplência', () => {
    /*
     * A Google promete acesso à pessoa durante a carência, enquanto tenta
     * cobrar de novo. Cortar aqui seria punir quem só teve um cartão recusado,
     * e contrariar o que a própria loja disse a ela.
     */
    expect(estadoDoGoogle(doGoogle('SUBSCRIPTION_STATE_IN_GRACE_PERIOD'), opcoes).status).toBe(
      'ACTIVE',
    )
  })

  it('CANCELED vale até o fim do ciclo pago', () => {
    expect(estadoDoGoogle(doGoogle('SUBSCRIPTION_STATE_CANCELED'), opcoes)).toMatchObject({
      status: 'CANCELED',
      until: new Date(daquiA(29)).toISOString(),
    })
  })

  it('ON_HOLD derruba, mesmo com `expiryTime` no futuro', () => {
    /*
     * O caso mais escorregadio do Google: em ON_HOLD a carência acabou sem
     * pagamento, e `expiryTime` **continua no futuro**. Quem decidir por data
     * em vez de por estado dá Synse+ de graça a quem parou de pagar.
     */
    const emEspera = estadoDoGoogle(doGoogle('SUBSCRIPTION_STATE_ON_HOLD'), opcoes)
    expect(emEspera).toMatchObject({ status: 'EXPIRED', until: null })
  })

  it.each([
    ['SUBSCRIPTION_STATE_PAUSED', 'pausa a pedido da pessoa'],
    ['SUBSCRIPTION_STATE_PENDING', 'compra iniciada e não paga'],
    ['SUBSCRIPTION_STATE_EXPIRED', 'acabou'],
    ['SUBSCRIPTION_STATE_UNSPECIFIED', 'a Google não disse'],
    ['ESTADO_QUE_A_GOOGLE_INVENTAR_AMANHA', 'nome que este código não conhece'],
  ])('%s não dá acesso (%s)', (estado) => {
    expect(estadoDoGoogle(doGoogle(estado), opcoes).status).toBe('EXPIRED')
  })

  it('ACTIVE com data vencida não dá acesso', () => {
    const vencida = doGoogle('SUBSCRIPTION_STATE_ACTIVE', {
      lineItems: [
        { productId: 'synse_plus_mensal', expiryTime: new Date(haviaDias(1)).toISOString() },
      ],
    })
    expect(estadoDoGoogle(vencida, opcoes).status).toBe('EXPIRED')
  })

  it('data ausente ou inválida não dá acesso', () => {
    for (const lineItems of [
      undefined,
      [{ productId: 'synse_plus_mensal' }],
      [{ productId: 'synse_plus_mensal', expiryTime: 'amanhã' }],
    ]) {
      const sem = doGoogle('SUBSCRIPTION_STATE_ACTIVE', { lineItems })
      expect(estadoDoGoogle(sem, opcoes).status).toBe('EXPIRED')
    }
  })

  it('o horário do evento é nulo, e isso é deliberado', () => {
    /*
     * A resposta da Google não traz quando ela mudou a assinatura. Nulo
     * desliga a regra 1 da 0061 para esta origem — inventar `now()` faria a
     * ordenação parecer existir, e a primeira notificação reenviada fora de
     * ordem passaria com cara de ordenada.
     */
    expect(estadoDoGoogle(doGoogle('SUBSCRIPTION_STATE_ACTIVE'), opcoes).eventoEm).toBeNull()
  })

  it('e sem id de conta a referência é nula, não inventada', () => {
    const anonima = doGoogle('SUBSCRIPTION_STATE_ACTIVE', { externalAccountIdentifiers: {} })
    expect(estadoDoGoogle(anonima, opcoes).referencia).toBeNull()
  })
})
