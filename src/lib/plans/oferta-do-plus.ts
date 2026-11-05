/**
 * ── O que a tela do Synse+ pode oferecer, e onde ─────────────────────────────
 *
 * A auditoria de 17/10/2026 encontrou o Synse+ sendo vendido dentro do app por
 * assinatura no Mercado Pago, destravando só conteúdo digital. Isso é o que
 * Apple e Google reservam para a cobrança **delas**, e a decisão do dono do
 * produto foi oferecer a cobrança da loja ao lado do Mercado Pago — que é o
 * que as duas exigem hoje no Brasil.
 *
 * Esta função é a linha. Ela responde uma coisa só: **qual caminho de compra
 * pode aparecer**.
 *
 * ── Dentro do app, nunca o Mercado Pago ──────────────────────────────────────
 *
 * É a única regra dura daqui, e não tem exceção configurável. Enquanto a
 * cobrança da loja não existir, o app não vende Synse+ **de jeito nenhum** —
 * em vez de vender pelo caminho errado enquanto o certo é construído.
 *
 * Essa escolha tem uma consequência boa que não é óbvia: **o app pode ser
 * publicado antes de o IAP existir.** Sem caminho de compra não há infração, e
 * a venda segue inteira na web, onde não há comissão. O botão da loja entra
 * depois, trocando uma constante.
 *
 * ── O preço também não ───────────────────────────────────────────────────────
 *
 * Quem olha isto depois vai achar exagero esconder o valor, já que ninguém
 * compra ali. Mas a regra alcança **levar** à compra, não só efetuá-la, e
 * preço na tela sem botão é instrução para procurar onde pagar. Netflix e
 * Spotify não mostram valor dentro do app, e não é timidez: é o que sobrou
 * depois de tentarem.
 */

export type OfertaDoPlus =
  /** Botão de assinatura pelo Mercado Pago. Só na web. */
  | 'mercadopago'
  /** Botão de compra pela App Store ou Google Play. Só dentro do app. */
  | 'loja'
  /**
   * Dentro do app, sem a cobrança da loja construída. Nenhum caminho de
   * compra, nenhum preço, e **nenhuma indicação de onde pagar**.
   */
  | 'nenhuma-no-app'
  /**
   * Na web, com o provedor simulado. Também não vende — mas por outro motivo,
   * e a pessoa precisa ler outra frase.
   *
   * As duas não podem ser o mesmo valor, e eu as colapsei numa primeira
   * versão: a tela acabou dizendo "o Synse+ faz parte da sua conta" para quem
   * estava na web esperando um botão que não apareceu por falta de provedor.
   * Mesma ausência de botão, explicação oposta.
   */
  | 'sem-provedor'

/**
 * A cobrança pela loja está construída e configurada?
 *
 * ── `false`, e o motivo mudou ───────────────────────────────────────────────
 *
 * Até 19/10/2026 esta constante era `false` porque **o código não existia**.
 * Hoje ele existe inteiro: plugin nativo nas duas plataformas, verificação de
 * recibo, notificações das duas lojas, e a 0061 por baixo. São 155 testes.
 *
 * Continua `false` por outro motivo, e ele é mais simples: **nada disso
 * jamais processou uma compra.** Não há produto cadastrado nos painéis, não há
 * conta de serviço do Google configurada, e ninguém viu a folha de pagamento
 * abrir num aparelho. Código escrito não é código verificado — e este projeto
 * já foi mordido duas vezes por essa diferença.
 *
 * Quem virar esta chave está afirmando ter visto uma compra funcionar. O que
 * falta antes está em `docs/publicar-passo-a-passo.md`, na Fase 6.
 *
 * É constante e não variável de ambiente de propósito: isto é capacidade de
 * código, não configuração de instalação. Ligar por variável permitiria ligar
 * em produção sem que ninguém tivesse testado nada.
 */
export const LOJA_DISPONIVEL = false

export function ofertaDoPlus(input: {
  /** O pedido veio de dentro do aplicativo nativo? */
  noApp: boolean
  /** A cobrança da loja existe? Ver `LOJA_DISPONIVEL`. */
  lojaDisponivel?: boolean
  /** O provedor de pagamento da web é o simulado? Botão falso é pior que botão nenhum. */
  provedorSimulado: boolean
}): OfertaDoPlus {
  const { noApp, provedorSimulado } = input
  const lojaDisponivel = input.lojaDisponivel ?? LOJA_DISPONIVEL

  /*
   * Dentro do app a única alternativa ao botão da loja é não vender. Note que
   * `provedorSimulado` **não** participa desta decisão: ele é sobre o provedor
   * da web, e deixá-lo influenciar aqui já seria admitir que algum estado dele
   * faz o Mercado Pago aparecer no app.
   */
  if (noApp) return lojaDisponivel ? 'loja' : 'nenhuma-no-app'

  /*
   * Na web, só o provedor simulado tira o botão. É a mesma razão do PIX
   * simulado da mensalidade: um checkout que não cobra manda a pessoa culpar
   * o próprio banco antes de culpar o app.
   */
  return provedorSimulado ? 'sem-provedor' : 'mercadopago'
}

/**
 * O preço só aparece onde se pode comprar.
 *
 * Inclui `sem-provedor`: na web, o valor pode ser mostrado mesmo com o botão
 * desligado — ali não há regra de loja, e esconder o preço de quem está
 * decidindo seria esconder a informação que a decisão pede. O que não pode
 * aparecer é preço **dentro do app**.
 */
export function mostraPreco(oferta: OfertaDoPlus): boolean {
  return oferta !== 'nenhuma-no-app'
}
