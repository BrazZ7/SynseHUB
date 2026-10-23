import { createSign } from 'node:crypto'

import type { AssinaturaDoGoogle } from '@/lib/plans/lojas/estado'

/**
 * ── A consulta da assinatura na Play Developer API ───────────────────────────
 *
 * Ao contrário da Apple, o Google **não** entrega nada assinado: o plugin
 * devolve um `purchaseToken`, que é um identificador opaco sem prova nenhuma
 * dentro. A única forma de saber se ele vale é perguntar ao Google.
 *
 * Consequência que vale ter clara: aqui a disponibilidade de um terceiro entra
 * no caminho de uma compra. Se a API do Google estiver fora, a verificação
 * falha — e falhar é o certo, porque a alternativa é liberar sem saber.
 *
 * ── O que precisa estar configurado ──────────────────────────────────────────
 *
 * Uma **conta de serviço** do Google Cloud, com a Play Developer API habilitada
 * e acesso concedido na Play Console (*Usuários e permissões → convidar
 * usuário → a conta de serviço → ver dados financeiros*). O JSON da chave vai
 * inteiro em `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`.
 *
 * Sem ela, `consultarAssinaturaDoGoogle` lança. Não há modo degradado: uma
 * verificação que "passa" sem credencial é pior que uma que não roda.
 */

const ESCOPO = 'https://www.googleapis.com/auth/androidpublisher'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3'

export type ContaDeServico = {
  client_email: string
  private_key: string
}

/** Não deu para verificar **agora**. Tentar de novo pode funcionar. */
export class LojaIndisponivel extends Error {
  constructor(motivo: string) {
    super(`Play Developer API: ${motivo}`)
    this.name = 'LojaIndisponivel'
  }
}

/**
 * O Google não conhece este token. Definitivo.
 *
 * Classe separada porque a diferença muda o que a tela faz, e a primeira
 * versão deste arquivo **descrevia** a distinção num comentário e lançava a
 * mesma exceção dos dois casos — ou seja, a distinção não existia. Um token
 * inventado virava "a loja está fora", e a tela mandava tentar de novo para
 * sempre. Achado por mutação: trocar o ramo do 404 pelo caso geral não
 * derrubou nada, porque os dois faziam o mesmo.
 */
export class CompraInexistente extends Error {
  constructor(motivo: string) {
    super(`Play Developer API: ${motivo}`)
    this.name = 'CompraInexistente'
  }
}

/** Lê a conta de serviço do ambiente. Nulo quando não está configurada. */
export function contaDeServicoDoGoogle(): ContaDeServico | null {
  const bruto = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON
  if (!bruto) return null
  try {
    const lido = JSON.parse(bruto) as Partial<ContaDeServico>
    if (!lido.client_email || !lido.private_key) return null
    /*
     * `\n` literal vira quebra de linha: quem cola o JSON numa variável de
     * ambiente da Vercel quase sempre acaba com a chave numa linha só, e o
     * OpenSSL recusa o PEM sem quebras com um erro que não diz isso.
     */
    return { client_email: lido.client_email, private_key: lido.private_key.replace(/\\n/g, '\n') }
  } catch {
    return null
  }
}

const base64url = (valor: object) => Buffer.from(JSON.stringify(valor)).toString('base64url')

/**
 * Monta o JWT que a conta de serviço troca por um token de acesso.
 *
 * Função pura sobre a conta e o instante, de propósito: é a parte do fluxo do
 * Google que dá para testar sem rede e sem credencial de verdade.
 */
export function montarJwtDaContaDeServico(
  conta: ContaDeServico,
  agora: Date = new Date(),
): string {
  const emitidoEm = Math.floor(agora.getTime() / 1000)

  const cabecalho = base64url({ alg: 'RS256', typ: 'JWT' })
  const corpo = base64url({
    iss: conta.client_email,
    scope: ESCOPO,
    aud: TOKEN_URL,
    iat: emitidoEm,
    /*
     * Uma hora é o teto que o Google aceita. Pedir mais faz a troca ser
     * recusada com `invalid_grant`, que não diz nada sobre o prazo.
     */
    exp: emitidoEm + 3600,
  })

  const assinador = createSign('RSA-SHA256')
  assinador.update(`${cabecalho}.${corpo}`)
  assinador.end()
  const assinatura = assinador.sign(conta.private_key).toString('base64url')

  return `${cabecalho}.${corpo}.${assinatura}`
}

type Buscar = typeof fetch

/**
 * Token de acesso, guardado em memória enquanto vale.
 *
 * Uma compra não pode gastar duas viagens de rede quando uma basta. O cache é
 * por instância — em ambiente sem servidor cada uma tem o seu, e isso está
 * certo: o token é por processo e não há estado compartilhado para invalidar.
 *
 * A margem de 60s evita o caso em que o token vence entre a troca e o uso.
 */
let cache: { token: string; validoAte: number } | null = null

export function limparCacheDoToken() {
  cache = null
}

export async function tokenDeAcesso(
  conta: ContaDeServico,
  opcoes: { buscar?: Buscar; agora?: Date } = {},
): Promise<string> {
  const agora = opcoes.agora ?? new Date()
  const buscar = opcoes.buscar ?? fetch

  if (cache && cache.validoAte > agora.getTime() + 60_000) return cache.token

  const resposta = await buscar(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: montarJwtDaContaDeServico(conta, agora),
    }),
  })

  if (!resposta.ok) {
    /*
     * O corpo do erro do Google traz `error_description`, que é a única pista
     * útil — "invalid_grant" sozinho serve para relógio errado, chave revogada
     * e escopo não habilitado. Mas ele **não** entra no log: a resposta pode
     * ecoar parte da asserção, e a asserção é assinada com a chave privada.
     */
    throw new LojaIndisponivel(`troca de token falhou com HTTP ${resposta.status}`)
  }

  const dados = (await resposta.json()) as { access_token?: string; expires_in?: number }
  if (!dados.access_token) throw new LojaIndisponivel('troca de token sem access_token')

  cache = {
    token: dados.access_token,
    validoAte: agora.getTime() + (dados.expires_in ?? 3600) * 1000,
  }
  return cache.token
}

/**
 * O estado da assinatura, direto do Google.
 *
 * `subscriptionsv2` e não `subscriptions`: a v1 devolve um recibo por produto,
 * não sabe de assinatura com vários itens, e o Google a deu por obsoleta.
 */
export async function consultarAssinaturaDoGoogle(
  purchaseToken: string,
  opcoes: { pacote: string; conta?: ContaDeServico | null; buscar?: Buscar; agora?: Date },
): Promise<AssinaturaDoGoogle> {
  const conta = opcoes.conta ?? contaDeServicoDoGoogle()
  if (!conta) {
    throw new LojaIndisponivel('conta de serviço não configurada (GOOGLE_PLAY_SERVICE_ACCOUNT_JSON)')
  }

  const buscar = opcoes.buscar ?? fetch
  const token = await tokenDeAcesso(conta, { buscar, agora: opcoes.agora })

  const url =
    `${API}/applications/${encodeURIComponent(opcoes.pacote)}` +
    `/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`

  const resposta = await buscar(url, { headers: { authorization: `Bearer ${token}` } })

  if (resposta.status === 404 || resposta.status === 410) {
    /*
     * Token que o Google não conhece (404) ou que já foi recolhido (410). É o
     * caso de alguém mandando um `purchaseToken` inventado para a nossa rota, e
     * a resposta é **definitiva**: não há compra, e repetir não vai criar uma.
     */
    throw new CompraInexistente('o Google não conhece este purchaseToken')
  }
  if (!resposta.ok) {
    throw new LojaIndisponivel(`consulta falhou com HTTP ${resposta.status}`)
  }

  return (await resposta.json()) as AssinaturaDoGoogle
}
