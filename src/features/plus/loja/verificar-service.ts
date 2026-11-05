import 'server-only'

import { verificarJwsDaApple, type Ambiente } from '@/lib/plans/lojas/apple-jws'
import { estadoDaApple, estadoDoGoogle, type EstadoDaLoja } from '@/lib/plans/lojas/estado'
import { consultarAssinaturaDoGoogle, type ContaDeServico } from '@/lib/plans/lojas/google-api'
import type { Loja } from '@/lib/plans/lojas/tipos'

/**
 * ── Da compra na loja para a assinatura na conta ─────────────────────────────
 *
 * Esta função faz a parte que decide, e nada de HTTP: a rota lê o corpo e
 * cuida de sessão e limite de tentativas; aqui mora o que precisa estar certo.
 *
 * Separado porque é testável assim. A rota é casca.
 *
 * ── A conferência que impede o recibo emprestado ─────────────────────────────
 *
 * **O passo mais importante deste arquivo**, e o menos óbvio.
 *
 * Um recibo da App Store é um documento válido, assinado pela Apple, que
 * qualquer pessoa consegue extrair do próprio aparelho. Sem amarrá-lo à conta,
 * um recibo legítimo vira senha de Synse+: a pessoa assina uma vez, publica o
 * texto num grupo, e todos que o colarem recebem acesso. Verificação
 * criptográfica impecável, e assinatura nenhuma a mais vendida.
 *
 * O que fecha isso é a `referencia` — `appAccountToken` na Apple,
 * `obfuscatedAccountId` no Google —, que o plugin manda na compra e a loja
 * devolve no recibo. Ela tem de ser **o perfil de quem está pedindo**.
 *
 * E quando a loja não devolve referência nenhuma, a resposta é recusar. Aceitar
 * "sem referência" é abrir exatamente o buraco acima para todo recibo que a
 * loja decidir mandar incompleto.
 */

export type ResultadoDaVerificacao =
  | { ok: true; estado: EstadoDaLoja }
  /** O recibo não é válido, ou não é desta conta. Não cria nada. */
  | { ok: false; motivo: 'invalido' | 'de-outra-conta' | 'produto-desconhecido'; detalhe: string }
  /** Não foi possível verificar agora. A tela pode tentar de novo. */
  | { ok: false; motivo: 'indisponivel'; detalhe: string }

export type DependenciasDaVerificacao = {
  loja: Loja
  comprovante: string
  /** O perfil de quem está pedindo. A referência do recibo tem de bater. */
  perfil: string
  /** O produto que esperamos. Recibo de outro produto não vira Synse+. */
  produtoEsperado: string
  apple: { raizPem: string; bundleId: string; ambientes: readonly Ambiente[] }
  google: { pacote: string; conta?: ContaDeServico | null; buscar?: typeof fetch }
  agora?: Date
}

export async function verificarCompraDaLoja(
  deps: DependenciasDaVerificacao,
): Promise<ResultadoDaVerificacao> {
  const agora = deps.agora ?? new Date()

  let estado: EstadoDaLoja
  try {
    if (deps.loja === 'apple') {
      const transacao = verificarJwsDaApple(deps.comprovante, {
        raizPem: deps.apple.raizPem,
        bundleId: deps.apple.bundleId,
        ambientes: deps.apple.ambientes,
        agora,
      })
      estado = estadoDaApple(transacao, agora)
    } else {
      const assinatura = await consultarAssinaturaDoGoogle(deps.comprovante, {
        pacote: deps.google.pacote,
        conta: deps.google.conta,
        buscar: deps.google.buscar,
        agora,
      })
      estado = estadoDoGoogle(assinatura, { purchaseToken: deps.comprovante, agora })
    }
  } catch (erro) {
    /*
     * Duas falhas diferentes, e misturá-las custaria caro nas duas direções.
     *
     * `JwsInvalida` é definitivo: aquele comprovante não vale, e a tela tem de
     * parar de tentar. `LojaIndisponivel` é a API do Google fora ou sem
     * credencial — a compra pode ser boa, e mandar a pessoa desistir seria
     * perder uma assinatura paga.
     */
    const nome = erro instanceof Error ? erro.name : ''
    const detalhe = erro instanceof Error ? erro.message : String(erro)
    /*
     * `CompraInexistente` entra no mesmo lado de `JwsInvalida`: o Google
     * respondeu que não conhece o token, e isso não melhora com repetição.
     * Mandar a tela tentar de novo seria um laço que nunca fecha.
     */
    return nome === 'JwsInvalida' || nome === 'CompraInexistente'
      ? { ok: false, motivo: 'invalido', detalhe }
      : { ok: false, motivo: 'indisponivel', detalhe }
  }

  if (estado.produto !== deps.produtoEsperado) {
    /*
     * Recibo de outro produto nosso — um dia haverá outro — ou de um produto
     * que não existe mais. Não vira Synse+ por semelhança.
     */
    return {
      ok: false,
      motivo: 'produto-desconhecido',
      detalhe: `produto "${estado.produto}" não é ${deps.produtoEsperado}`,
    }
  }

  // ── A amarra com a conta. Ver a nota no cabeçalho. ─────────────────────────
  if (!estado.referencia) {
    return {
      ok: false,
      motivo: 'de-outra-conta',
      detalhe: 'a loja não devolveu a referência da conta',
    }
  }
  if (estado.referencia !== deps.perfil) {
    return {
      ok: false,
      motivo: 'de-outra-conta',
      detalhe: 'a referência do recibo não é deste perfil',
    }
  }

  return { ok: true, estado }
}
