/**
 * Estado da adesão ao Synse+.
 *
 * Mora fora do arquivo `'use server'` porque lá só pode haver função
 * assíncrona exportada — regra guardada por `tests/unit/use-server-exports.test.ts`.
 */
import type { VeredictoDeAssinatura } from '@/lib/plans/pode-assinar'
import type { OrigemDaAssinatura } from '@/lib/plans/subscription'

export type AdesaoState = {
  status: 'idle' | 'error'
  message?: string
}

export const adesaoInicial: AdesaoState = { status: 'idle' }

/** O nome de cada origem como a pessoa a reconhece na fatura ou no aparelho. */
const NOME_DA_ORIGEM: Record<OrigemDaAssinatura, string> = {
  mercadopago: 'Mercado Pago',
  apple: 'App Store',
  google: 'Google Play',
}

/**
 * O que dizer quando a assinatura é recusada, e por que cada frase é assim.
 *
 * Dizer só "você já tem o Synse+" era suficiente com uma origem. Com três, é
 * uma pessoa olhando a fatura do cartão errado: quem assinou pela App Store
 * cancela na App Store, e nenhuma tela nossa cancela por ela.
 *
 * `outra-origem` **não** oferece caminho de compra nem link de pagamento. Isso
 * não é timidez: mandar a pessoa pagar fora da loja, de dentro do app, é o que
 * Apple e Google proíbem — e a mesma frase serve na web sem prejuízo.
 */
export function mensagemDeNaoAssinar(veredicto: VeredictoDeAssinatura): string {
  if (veredicto.pode) throw new Error('mensagemDeNaoAssinar chamada para um veredicto que pode')

  switch (veredicto.motivo) {
    case 'mesma-origem':
      return 'Sua conta já tem o Synse+ ativo.'
    case 'outra-origem':
      return `Sua conta já tem o Synse+ ativo, com cobrança pelo ${NOME_DA_ORIGEM[veredicto.origem]}. Para alterar ou cancelar, use a assinatura por lá.`
    case 'origem-desconhecida':
      return 'Sua conta já tem o Synse+ ativo. Se não reconhece essa assinatura, fale com o suporte antes de assinar de novo.'
  }
}
