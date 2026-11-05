import { createVerify, X509Certificate } from 'node:crypto'

/**
 * ── A verificação da transação da App Store ──────────────────────────────────
 *
 * O StoreKit 2 devolve cada transação como uma **JWS**: três partes em base64,
 * assinadas pela Apple, com a cadeia de certificados embutida no cabeçalho
 * (`x5c`). A vantagem sobre o StoreKit 1 é que isto se verifica sem chamar
 * ninguém — não há endpoint, não há credencial, não há indisponibilidade de
 * terceiro no caminho de uma compra.
 *
 * A desvantagem é que a verificação é inteiramente nossa, e errar aqui não
 * falha: libera. Então cada checagem abaixo tem o seu motivo escrito, e cada
 * uma tem um teste que a derruba.
 *
 * ── O erro que torna tudo isto decorativo ────────────────────────────────────
 *
 * A cadeia vem **dentro da JWS**. Conferir "a assinatura combina com o
 * certificado do `x5c`" é conferir que quem assinou assinou — qualquer pessoa
 * gera um par de chaves, monta um `x5c` com ele e assina o que quiser. Já vi
 * essa implementação em artigo de blog.
 *
 * O que dá valor à conferência é a **raiz fixada**: o último certificado da
 * cadeia tem de ser, byte a byte, a `Apple Root CA - G3` que está em
 * `apple-raiz.pem`. Sem essa amarra, o resto é teatro.
 *
 * ── E o segundo erro, que é clássico ─────────────────────────────────────────
 *
 * `alg` vem do cabeçalho, que é parte do dado não confiável. Aceitar o que ele
 * diz permite `alg: "none"` — assinatura vazia, verificação que passa. Aqui só
 * `ES256` é aceito, e qualquer outro valor é recusa antes de qualquer conta.
 */

/** O que a Apple põe no corpo de uma transação assinada. */
export type TransacaoDaApple = {
  transactionId: string
  originalTransactionId: string
  productId: string
  bundleId: string
  /** Epoch em ms, como a Apple manda. */
  purchaseDate: number
  /** Fim do ciclo. Ausente em compra que não é assinatura. */
  expiresDate?: number
  /** O id do perfil, mandado na compra como `appAccountToken`. */
  appAccountToken?: string
  /** Preenchido quando houve estorno. Presença significa acesso revogado. */
  revocationDate?: number
  revocationReason?: number
  type?: string
  environment?: string
  /** Quando a Apple assinou. É o horário do evento na origem, para a 0061. */
  signedDate?: number
}

export type Ambiente = 'Production' | 'Sandbox'

export class JwsInvalida extends Error {
  constructor(motivo: string) {
    super(`JWS da App Store recusada: ${motivo}`)
    this.name = 'JwsInvalida'
  }
}

type Opcoes = {
  /** PEM da raiz fixada. Obrigatório: sem raiz não há verificação. */
  raizPem: string
  /** O bundle id do app. Transação de outro app não vale aqui. */
  bundleId: string
  /**
   * Quais ambientes aceitar.
   *
   * **Sem padrão de propósito.** Aceitar `Sandbox` em produção é dar Synse+ a
   * quem tem uma conta de teste da Apple — grátis, ilimitado, e sem aparecer
   * em relatório de receita nenhum. Deixar a escolha implícita é o jeito de
   * esse buraco existir sem ninguém ter decidido abri-lo.
   */
  ambientes: readonly Ambiente[]
  agora?: Date
}

/**
 * ── Só a parte criptográfica: cadeia, raiz fixada e assinatura ──────────────
 *
 * Separada porque a Apple assina **duas coisas diferentes** do mesmo jeito: a
 * transação de uma compra e a notificação do servidor dela. A conferência de
 * cadeia é idêntica; o que cada uma precisa ter no corpo não é — a notificação
 * não tem `productId` nem `bundleId` no topo, e exigir isso dela recusaria
 * toda notificação legítima.
 *
 * Então aqui mora o que é comum, e quem chama confere o conteúdo que lhe cabe.
 * Antes isto era um bloco só com as checagens de transação embutidas, e
 * reaproveitar significaria afrouxá-las.
 *
 * **Devolve JSON sem validar nada do conteúdo.** Quem chama é responsável por
 * isso — e é por isso que esta função não é exportada como "verificar".
 */
export function corpoAssinadoPelaApple(
  jws: string,
  opcoes: { raizPem: string; agora?: Date },
): Record<string, unknown> {
  const agora = opcoes.agora ?? new Date()

  const partes = jws.split('.')
  if (partes.length !== 3) throw new JwsInvalida('não tem três partes')
  const [cabecalhoB64, corpoB64, assinaturaB64] = partes

  const cabecalho = lerJson(cabecalhoB64, 'cabeçalho')

  // ── O `alg`, antes de qualquer outra coisa ─────────────────────────────────
  if (cabecalho.alg !== 'ES256') {
    throw new JwsInvalida(`alg "${String(cabecalho.alg)}" não é ES256`)
  }

  const x5c = cabecalho.x5c
  if (!Array.isArray(x5c) || x5c.length < 2) {
    throw new JwsInvalida('x5c ausente ou com menos de dois certificados')
  }

  const cadeia = x5c.map((base64, i) => {
    if (typeof base64 !== 'string') throw new JwsInvalida(`x5c[${i}] não é texto`)
    try {
      return new X509Certificate(Buffer.from(base64, 'base64'))
    } catch {
      throw new JwsInvalida(`x5c[${i}] não é um certificado`)
    }
  })

  // ── A raiz fixada ─────────────────────────────────────────────────────────
  const raiz = new X509Certificate(opcoes.raizPem)
  const ultimo = cadeia[cadeia.length - 1]
  /*
   * Comparação do DER inteiro, não do nome nem da impressão digital. Nome se
   * escolhe; impressão é resumo — e comparar o certificado todo custa o mesmo.
   */
  if (!ultimo.raw.equals(raiz.raw)) {
    throw new JwsInvalida('a cadeia não termina na raiz fixada da Apple')
  }

  // ── Cada elo: emissor correto, assinatura válida, dentro da validade ──────
  for (let i = 0; i < cadeia.length; i++) {
    const certificado = cadeia[i]

    if (new Date(certificado.validFrom) > agora) {
      throw new JwsInvalida(`x5c[${i}] ainda não é válido`)
    }
    if (new Date(certificado.validTo) < agora) {
      throw new JwsInvalida(`x5c[${i}] está expirado`)
    }

    // O último é a raiz, que se assina.
    const emissor = i === cadeia.length - 1 ? certificado : cadeia[i + 1]

    /*
     * ── Só `verify`, e não `checkIssued` junto ──────────────────────────────
     *
     * A primeira versão chamava as duas, com o comentário "uma compara nomes,
     * a outra confere a assinatura". A mutação desmentiu: remover
     * `checkIssued` não derrubou nenhum teste, e não por falta de teste —
     * **tudo o que ele pega, `verify` pega.**
     *
     * Faz sentido: se a assinatura de A confere com a chave pública de B,
     * então quem tem a chave de B assinou A. Essa é a propriedade; o nome no
     * campo `issuer` é só uma afirmação de quem montou o certificado.
     *
     * Ficou um só. Código de segurança redundante é pior que código a menos:
     * alguém o lê, acha que está protegido por ele, e não está.
     */
    if (!certificado.verify(emissor.publicKey)) {
      throw new JwsInvalida(`a assinatura de x5c[${i}] não confere com x5c[${i + 1}]`)
    }
  }

  // ── A assinatura da JWS, com a folha ──────────────────────────────────────
  const folha = cadeia[0]
  const verificador = createVerify('sha256')
  verificador.update(`${cabecalhoB64}.${corpoB64}`)
  verificador.end()

  /*
   * `ieee-p1363` e não o padrão do Node.
   *
   * JWS carrega a assinatura ECDSA como `r || s` concatenados e crus; o OpenSSL
   * espera DER por omissão. Sem este parâmetro, **toda** assinatura legítima é
   * recusada — e o sintoma é "nenhuma compra funciona", que leva a gente a
   * procurar no lugar errado por um dia.
   */
  const confere = verificador.verify(
    { key: folha.publicKey, dsaEncoding: 'ieee-p1363' },
    Buffer.from(assinaturaB64, 'base64url'),
  )
  if (!confere) throw new JwsInvalida('a assinatura não confere com o certificado da folha')

  return lerJson(corpoB64, 'corpo')
}

/**
 * A transação de uma compra: a cadeia **e** o que o corpo precisa dizer.
 */
export function verificarJwsDaApple(jws: string, opcoes: Opcoes): TransacaoDaApple {
  const corpo = corpoAssinadoPelaApple(jws, {
    raizPem: opcoes.raizPem,
    agora: opcoes.agora,
  }) as unknown as TransacaoDaApple

  if (corpo.bundleId !== opcoes.bundleId) {
    /*
     * Transação de outro aplicativo, assinada pela Apple de verdade. Sem esta
     * linha, qualquer compra de qualquer app da App Store viraria Synse+.
     */
    throw new JwsInvalida(`bundleId "${String(corpo.bundleId)}" não é ${opcoes.bundleId}`)
  }

  const ambiente = corpo.environment
  if (!ambiente || !opcoes.ambientes.includes(ambiente as Ambiente)) {
    throw new JwsInvalida(`ambiente "${String(ambiente)}" não é aceito`)
  }

  if (!corpo.transactionId || !corpo.productId) {
    throw new JwsInvalida('corpo sem transactionId ou productId')
  }

  return corpo
}

function lerJson(parte: string, nome: string): Record<string, unknown> {
  try {
    const texto = Buffer.from(parte, 'base64url').toString('utf8')
    const lido = JSON.parse(texto)
    if (!lido || typeof lido !== 'object' || Array.isArray(lido)) {
      throw new Error('não é objeto')
    }
    return lido as Record<string, unknown>
  } catch {
    throw new JwsInvalida(`${nome} não é JSON em base64url`)
  }
}
