import {
  resumoDaAssinatura,
  type OrigemDaAssinatura,
  type PlusSubscription,
} from '@/lib/plans/subscription'

/**
 * ── Pode começar uma assinatura do Synse+ aqui, agora? ──────────────────────
 *
 * Com uma origem de cobrança só, a pergunta era "já é assinante?" e a resposta
 * cabia num booleano. Com três — Mercado Pago na web, Apple e Google dentro do
 * app — ela deixou de caber, porque **onde** a assinatura vive muda o que a
 * tela pode fazer:
 *
 *   - quem assinou pela App Store e abre o site não pode comprar de novo: já
 *     paga, e a segunda cobrança seria nossa culpa;
 *   - quem assinou na web e abre o app não pode ver botão de comprar, pela
 *     mesma razão — e também porque mandar a pessoa pagar fora da loja, de
 *     dentro do app, é o que as duas lojas proíbem;
 *   - quem assinou pela loja e reinstalou o app não quer comprar: quer
 *     **restaurar**, que é botão diferente e cobrança nenhuma.
 *
 * ── Esta trava é prevenção, não garantia ────────────────────────────────────
 *
 * E a diferença importa. A compra na loja pode se completar **sem passar por
 * aqui**: a pessoa toca no preço, a folha nativa abre, a Apple debita, e nós
 * só sabemos quando a notificação chega. Nenhuma checagem de servidor alcança
 * esse caminho.
 *
 * Por isso a regra 3 da 0061 existe do outro lado: se a compra aconteceu,
 * **o acesso segue a compra** e a duplicidade vira linha em
 * `plus_subscription_conflicts`. Esta função é o que faz esse caso ser raro;
 * a 0061 é o que faz ele não virar prejuízo de quem pagou.
 *
 * Função pura, sobre a assinatura da conta. É conta, e conta se testa.
 */

export type VeredictoDeAssinatura =
  | { pode: true }
  /**
   * Já é assinante, e a cobrança é desta mesma origem. No app, isto é
   * "restaurar compra"; na web, "você já é Synse+".
   */
  | { pode: false; motivo: 'mesma-origem'; origem: OrigemDaAssinatura }
  /**
   * Já é assinante, e a cobrança vive em outra origem. A tela tem de dizer
   * onde gerenciar, **sem** oferecer compra.
   */
  | { pode: false; motivo: 'outra-origem'; origem: OrigemDaAssinatura }
  /**
   * Já é assinante e não sabemos de onde. Acontece quando a 0061 não subiu, ou
   * quando a linha veio de antes dela. Recusa igual: na dúvida sobre cobrança,
   * não cobrar é o lado seguro de errar.
   */
  | { pode: false; motivo: 'origem-desconhecida'; origem: null }

export function podeAssinarPlus(input: {
  assinatura: PlusSubscription
  /** Por onde a pessoa está tentando assinar agora. */
  origemPretendida: OrigemDaAssinatura
  agora?: Date
}): VeredictoDeAssinatura {
  const { assinatura, origemPretendida, agora } = input

  /*
   * `resumoDaAssinatura` e não `status in ('TRIAL','ACTIVE')`: quem cancelou
   * continua assinante até o fim do período pago, e nesse intervalo oferecer
   * uma compra nova cobraria duas vezes pelo mesmo mês. A data manda, pelo
   * mesmo motivo que ela manda lá — não depende de ninguém ter rodado nada.
   */
  if (!resumoDaAssinatura(assinatura, agora).ativa) return { pode: true }

  if (assinatura.origem === null) return { pode: false, motivo: 'origem-desconhecida', origem: null }

  return assinatura.origem === origemPretendida
    ? { pode: false, motivo: 'mesma-origem', origem: assinatura.origem }
    : { pode: false, motivo: 'outra-origem', origem: assinatura.origem }
}
