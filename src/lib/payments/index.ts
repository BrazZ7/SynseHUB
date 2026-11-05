import 'server-only'

import { MercadoPagoProvider } from '@/lib/payments/providers/mercadopago'
import { mercadoPagoConfigurado } from '@/lib/payments/providers/mercadopago/env'
import { MockPaymentProvider } from '@/lib/payments/providers/mock'
import type { PaymentProvider } from '@/lib/payments/provider'
import { isDemoMode } from '@/lib/database/env'
import { env } from '@/lib/env'

/**
 * ── Fábrica do provedor de pagamentos ────────────────────────────────────────
 *
 * O resto da aplicação chama `getPaymentProvider()` e recebe a interface —
 * nunca uma classe concreta. É o que permitiu tirar o Asaas sem tocar em regra
 * de negócio, tela ou migration.
 *
 * ── Hoje não há provedor real ───────────────────────────────────────────────
 *
 * O Asaas saiu por causa da taxa, e o substituto ainda não foi escolhido.
 * Enquanto isso o único provedor é o simulado: nenhum centavo se move, em
 * nenhum ambiente.
 *
 * ── Por que a fábrica não morre quando o nome é desconhecido ────────────────
 *
 * Porque `PAYMENT_PROVIDER=asaas` continua na Vercel neste momento, e derrubar
 * a aplicação inteira por causa de uma variável obsoleta trocaria um problema
 * de cobrança por um problema de disponibilidade. Ela cai no simulado.
 *
 * O que ela **não** faz é cair em silêncio: `provedorDesconhecido()` devolve o
 * nome pedido, e `/api/health?deep=1` mostra os dois lados. Cair para o
 * simulado sem avisar seria a pior das três opções, porque a tela de cobrança
 * continuaria parecendo ligada e a sonda diria que está tudo bem.
 */

let cached: PaymentProvider | null = null

/** Os nomes que a fábrica sabe construir. */
const CONHECIDOS = ['mock', 'mercadopago'] as const

/**
 * ── Por que o nome sozinho não liga o Mercado Pago ──────────────────────────
 *
 * `PAYMENT_PROVIDER=mercadopago` sem `MERCADOPAGO_ACCESS_TOKEN` cai no
 * simulado, de propósito. Construir o adapter sem credencial faria a tela de
 * assinatura parecer ligada e falhar no clique, com um 502 que não diz nada a
 * quem clicou.
 *
 * Caindo no simulado, `isSimulatedProvider()` fica verdadeiro, a tela avisa
 * que nada é cobrado, e `/api/health?deep=1` mostra o nome pedido ao lado do
 * que está em uso. A diferença aparece na sonda, não no boleto de alguém.
 */
export function getPaymentProvider(): PaymentProvider {
  if (cached) return cached

  if (provedorConfigurado() === 'mercadopago' && mercadoPagoConfigurado()) {
    cached = new MercadoPagoProvider()
  } else {
    cached = new MockPaymentProvider()
  }

  return cached
}

/** O que `PAYMENT_PROVIDER` pede, em minúsculas. Vazio quando não definida. */
export function provedorConfigurado(): string {
  return env(process.env.PAYMENT_PROVIDER, '').toLowerCase()
}

/**
 * A configuração pede um provedor que esta build não tem?
 *
 * É o caso de `PAYMENT_PROVIDER=asaas` sobrando no ambiente depois da remoção.
 * A aplicação segue no simulado, e quem precisa saber disso é a sonda de saúde
 * — não o usuário, que não tem o que fazer com a informação.
 */
export function provedorDesconhecido(): string | null {
  const pedido = provedorConfigurado()
  if (!pedido || CONHECIDOS.includes(pedido as (typeof CONHECIDOS)[number])) return null
  return pedido
}

/** `true` quando nenhum dinheiro real se move — a UI sinaliza isso. */
export function isSimulatedProvider(): boolean {
  return getPaymentProvider().id === 'mock'
}

/**
 * ── Dá para cobrar de verdade? ──────────────────────────────────────────────
 *
 * Esta pergunta não é a mesma que "o provedor aceita PIX", e confundir as duas
 * já produziu o pior defeito que o app teve para o usuário: o simulado **aceita
 * PIX**, então a tela do aluno mostrava "PAGAR AGORA", gerava um BR Code
 * terminado em `6304MOCK` e mandava a pessoa colar no banco. Botão desativado
 * é ruim; botão que parece ter funcionado e entrega um código que o banco
 * recusa é pior — a pessoa culpa o próprio banco antes de culpar o app.
 *
 * ── Por que a demonstração continua cobrando ────────────────────────────────
 *
 * Porque lá o dinheiro falso é o ponto: sem banco conectado, tudo na tela é
 * demonstração e o app diz isso. Travar o PIX ali tiraria da demonstração
 * justamente a parte que uma dona de academia quer ver antes de assinar.
 *
 * A separação é essa: **simulado dentro da demonstração é honesto; simulado em
 * cima de um banco real é mentira.**
 */
export function cobrancaIndisponivel(): 'sem-provedor' | null {
  if (isDemoMode()) return null
  if (isSimulatedProvider()) return 'sem-provedor'

  /*
   * ── A segunda razão, que chegou com o Mercado Pago ────────────────────────
   *
   * Provedor real não quer dizer provedor que cobra **em nome da academia**.
   * O Mercado Pago entrou para a assinatura do Synse+, que é dinheiro do
   * Synse; a mensalidade da academia precisa de subconta e split, que ele faz
   * por outro caminho e ainda não integramos.
   *
   * Sem esta linha, trocar `PAYMENT_PROVIDER` para `mercadopago` acenderia o
   * "Pagar agora" da academia — e o adapter lançaria no clique. Seria a
   * mesma falha do PIX simulado de novo, com outro disfarce: a trava precisa
   * estar antes do botão, não depois.
   */
  return getPaymentProvider().suportaMarketplace ? null : 'sem-provedor'
}

export type { PaymentProvider } from '@/lib/payments/provider'
