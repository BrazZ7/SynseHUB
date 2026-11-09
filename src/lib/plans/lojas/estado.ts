import type { PlusStatus } from '@/lib/plans/subscription'

import type { TransacaoDaApple } from '@/lib/plans/lojas/apple-jws'

/**
 * ── Do estado da loja para o estado da conta ─────────────────────────────────
 *
 * Cada loja tem o seu vocabulário, e nenhum dos dois é o nosso. Isto traduz.
 *
 * ── A regra quando não se sabe ───────────────────────────────────────────────
 *
 * Estado que este código não reconhece cai em `EXPIRED`, e isso é escolha, não
 * omissão. É a mesma que `estadoDoPlus` do Mercado Pago já tomou, com a mesma
 * razão escrita lá: **perder um dia de acesso de quem pagou é um aborrecimento
 * que o suporte resolve; conceder acesso de graça não tem como ser desfeito.**
 *
 * E vale lembrar que derrubar por aqui não é a palavra final: a 0061 só aplica
 * se a origem for a dona da assinatura, e a notificação seguinte da loja
 * corrige. O inverso — liberar por omissão — ninguém corrige, porque ninguém
 * descobre.
 */

export type EstadoDaLoja = {
  status: PlusStatus
  /** Fim do ciclo, em ISO. Nulo quando não há acesso. */
  until: string | null
  /** Horário do evento na origem, para a regra 1 da 0061. */
  eventoEm: string | null
  /** O id do perfil que a loja devolveu. Nulo quando ela não mandou. */
  referencia: string | null
  /** O id da assinatura na loja, para conciliar. */
  refDaLoja: string
  produto: string
}

const iso = (ms: number | undefined | null) =>
  typeof ms === 'number' && Number.isFinite(ms) ? new Date(ms).toISOString() : null

/**
 * ── Apple ────────────────────────────────────────────────────────────────────
 *
 * O que uma transação assinada **não** diz: se a renovação automática foi
 * desligada. Isso vive no `signedRenewalInfo`, que é outra JWS e só chega nas
 * notificações do servidor da Apple.
 *
 * Consequência prática: de uma compra, o melhor que se sabe é "vale até tal
 * dia". Quem cancelou aparece como ACTIVE até a data — e está correto, porque o
 * período pago vale até o fim de qualquer forma. A diferença entre ACTIVE e
 * CANCELED só muda o que a tela escreve, e a notificação traz isso depois.
 */
export function estadoDaApple(
  transacao: TransacaoDaApple,
  agora: Date = new Date(),
): EstadoDaLoja {
  const base = {
    eventoEm: iso(transacao.signedDate),
    referencia: transacao.appAccountToken ?? null,
    refDaLoja: transacao.originalTransactionId || transacao.transactionId,
    produto: transacao.productId,
  }

  /*
   * Estorno vem primeiro, antes da data. Uma transação estornada continua com
   * `expiresDate` no futuro — o reembolso não reescreve o passado —, e olhar a
   * data antes daria acesso a quem recebeu o dinheiro de volta.
   */
  if (typeof transacao.revocationDate === 'number') {
    return { ...base, status: 'EXPIRED', until: null }
  }

  const fim = transacao.expiresDate
  if (typeof fim !== 'number' || fim <= agora.getTime()) {
    return { ...base, status: 'EXPIRED', until: null }
  }

  /*
   * `offerType === 1` é oferta introdutória, que é como o primeiro mês grátis
   * do Synse+ chega. Os outros tipos (promocional, código, reconquista) também
   * dão acesso; a distinção aqui só muda o rótulo na tela, e TRIAL é o que
   * permite escrever "primeira cobrança em tal dia" em vez de "renova".
   */
  const emTeste = (transacao as { offerType?: number }).offerType === 1

  return { ...base, status: emTeste ? 'TRIAL' : 'ACTIVE', until: new Date(fim).toISOString() }
}

/**
 * ── Google ───────────────────────────────────────────────────────────────────
 *
 * O formato é o de `purchases.subscriptionsv2.get` da Play Developer API. A v1
 * não aparece aqui: ela devolve um recibo por produto e não sabe de assinatura
 * com vários itens, e a Google a deu por obsoleta.
 */
export type AssinaturaDoGoogle = {
  subscriptionState?: string
  lineItems?: Array<{
    productId?: string
    expiryTime?: string
    autoRenewingPlan?: { autoRenewEnabled?: boolean }
  }>
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string }
  startTime?: string
  /** Quando a Google mudou isto pela última vez. Nem sempre vem. */
  latestOrderId?: string
}

export function estadoDoGoogle(
  assinatura: AssinaturaDoGoogle,
  opcoes: { purchaseToken: string; agora?: Date },
): EstadoDaLoja {
  const agora = opcoes.agora ?? new Date()
  const item = assinatura.lineItems?.[0]
  const fim = item?.expiryTime ? new Date(item.expiryTime) : null
  const noPrazo = fim !== null && !Number.isNaN(fim.getTime()) && fim.getTime() > agora.getTime()

  const base = {
    /*
     * A Google não manda horário de evento nesta resposta. Nulo desliga a
     * regra 1 da 0061 para o Google, e isso é honesto: inventar `now()` aqui
     * faria a ordenação parecer existir sem existir — e a primeira notificação
     * reenviada fora de ordem passaria com cara de ordenada.
     */
    eventoEm: null,
    referencia: assinatura.externalAccountIdentifiers?.obfuscatedExternalAccountId ?? null,
    refDaLoja: opcoes.purchaseToken,
    produto: item?.productId ?? '',
  }

  const semAcesso = { ...base, status: 'EXPIRED' as PlusStatus, until: null }

  switch (assinatura.subscriptionState) {
    case 'SUBSCRIPTION_STATE_ACTIVE':
      /*
       * Renovação desligada é cancelamento que ainda não venceu: o acesso
       * segue até o fim do pago, e a tela precisa dizer "encerrando" em vez de
       * "renova em".
       */
      return noPrazo
        ? {
            ...base,
            status: item?.autoRenewingPlan?.autoRenewEnabled === false ? 'CANCELED' : 'ACTIVE',
            until: fim!.toISOString(),
          }
        : semAcesso

    case 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD':
      /*
       * Cobrança falhou e a Google está tentando de novo. **A pessoa mantém
       * acesso** durante a carência — é o que a Google promete a ela, e cortar
       * aqui seria punir quem só teve um cartão recusado.
       */
      return noPrazo ? { ...base, status: 'ACTIVE', until: fim!.toISOString() } : semAcesso

    case 'SUBSCRIPTION_STATE_CANCELED':
      // Cancelada: vale até o fim do ciclo pago, como os Termos prometem.
      return noPrazo ? { ...base, status: 'CANCELED', until: fim!.toISOString() } : semAcesso

    case 'SUBSCRIPTION_STATE_ON_HOLD':
      /*
       * A carência acabou sem pagamento. Aqui o acesso para — e note que
       * `expiryTime` pode estar no futuro nesse estado, então olhar só a data
       * daria acesso de graça.
       */
      return semAcesso

    case 'SUBSCRIPTION_STATE_PAUSED':
      // Pausa é a pedido da pessoa, e sem acesso durante ela.
      return semAcesso

    case 'SUBSCRIPTION_STATE_PENDING':
      /*
       * Compra iniciada e **não paga** — boleto, débito pendente. Liberar aqui
       * é entregar antes de receber, e a Google avisa quando confirmar.
       */
      return semAcesso

    case 'SUBSCRIPTION_STATE_EXPIRED':
      return semAcesso

    default:
      // Estado que este código não conhece. Ver a nota no cabeçalho.
      return semAcesso
  }
}
