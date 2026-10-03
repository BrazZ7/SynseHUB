import { createHmac } from 'node:crypto'

import { timingSafeEqual } from '@/lib/secrets'
import type { PlusStatus } from '@/lib/plans/subscription'

/**
 * ── O que o Mercado Pago manda, e como conferir ──────────────────────────────
 *
 * Tudo aqui é função pura sobre texto: nada de rede, nada de banco. É o que
 * permite testar a parte que decide quem vira assinante sem uma credencial do
 * Mercado Pago — e credencial é justamente o que este repositório não tem.
 *
 * ── A assinatura do webhook ─────────────────────────────────────────────────
 *
 * O Mercado Pago manda dois cabeçalhos:
 *
 *     x-signature: ts=1704908010,v1=618c85345248dd820d5fd456117c2ab2ef8eda45a0...
 *     x-request-id: c3a1c3a1-...
 *
 * O texto assinado é montado com o id do recurso, o id da requisição e o
 * carimbo de tempo, nesta ordem e com esta pontuação:
 *
 *     id:123456;request-id:c3a1c3a1-...;ts:1704908010;
 *
 * HMAC-SHA256 desse texto com o segredo do painel, comparado com `v1`.
 *
 * ── Três detalhes que são a diferença entre conferir e fingir que confere ───
 *
 * 1. **O `id` vem da query string, nunca do corpo.** Quem forja um webhook
 *    controla o corpo inteiro; conferir a assinatura contra um id que o
 *    atacante escolheu é conferir contra ele mesmo.
 * 2. **Minúsculas.** O Mercado Pago normaliza assim antes de assinar.
 * 3. **Comparação de tempo constante**, pelo mesmo motivo de sempre.
 *
 * ── E por que isto sozinho não basta ────────────────────────────────────────
 *
 * Não consegui ler a documentação oficial deste esquema: a página responde 404
 * ao leitor automático. O formato acima vem de várias integrações
 * independentes que concordam entre si — é boa evidência, não é a fonte.
 *
 * Por isso a rota **não confia no corpo mesmo com assinatura válida**: ela usa
 * o id para reconsultar o estado no Mercado Pago e grava o que a API responde.
 * Se este formato estiver errado em algum detalhe, o pior que acontece é
 * webhook recusado — não assinatura concedida de graça.
 */

/** O texto que o Mercado Pago assina. Público para o teste poder conferir. */
export function montarManifest(input: { dataId: string; requestId: string; ts: string }): string {
  return `id:${input.dataId.toLowerCase()};request-id:${input.requestId};ts:${input.ts};`
}

/** As partes do cabeçalho `x-signature`, ou nulo quando ele não tem forma. */
export function lerAssinatura(header: string | null): { ts: string; v1: string } | null {
  if (!header) return null

  const partes = new Map<string, string>()
  for (const pedaco of header.split(',')) {
    const [chave, ...resto] = pedaco.split('=')
    if (!chave || resto.length === 0) continue
    partes.set(chave.trim(), resto.join('=').trim())
  }

  const ts = partes.get('ts')
  const v1 = partes.get('v1')
  return ts && v1 ? { ts, v1 } : null
}

export type ConferenciaDeAssinatura =
  | { valida: true }
  | { valida: false; motivo: 'sem-segredo' | 'sem-assinatura' | 'sem-id' | 'nao-confere' | 'velha' }

/**
 * A assinatura confere?
 *
 * `toleranciaSegundos` existe contra reenvio: uma requisição legítima
 * capturada e repetida semanas depois continuaria com assinatura válida para
 * sempre, porque o carimbo faz parte do texto assinado mas nada obriga a
 * olhá-lo. Cinco minutos é folga para atraso de rede sem virar janela aberta.
 */
export function conferirAssinatura(input: {
  header: string | null
  requestId: string | null
  dataId: string | null
  segredo: string
  agora?: Date
  toleranciaSegundos?: number
}): ConferenciaDeAssinatura {
  /*
   * Sem segredo a resposta é não, como em `bearerAutorizado`. Aceitar por
   * omissão transformaria um esquecimento de variável de ambiente num endereço
   * capaz de ativar assinatura paga de graça.
   */
  if (!input.segredo) return { valida: false, motivo: 'sem-segredo' }

  const partes = lerAssinatura(input.header)
  if (!partes) return { valida: false, motivo: 'sem-assinatura' }
  if (!input.dataId) return { valida: false, motivo: 'sem-id' }

  const tolerancia = input.toleranciaSegundos ?? 300
  const agora = Math.floor((input.agora?.getTime() ?? Date.now()) / 1000)
  const carimbo = Number(partes.ts)
  if (!Number.isFinite(carimbo) || Math.abs(agora - carimbo) > tolerancia) {
    return { valida: false, motivo: 'velha' }
  }

  const esperada = createHmac('sha256', input.segredo)
    .update(
      montarManifest({
        dataId: input.dataId,
        requestId: input.requestId ?? '',
        ts: partes.ts,
      }),
    )
    .digest('hex')

  return timingSafeEqual(esperada, partes.v1.toLowerCase())
    ? { valida: true }
    : { valida: false, motivo: 'nao-confere' }
}

// ── Do estado do Mercado Pago para o estado do Synse+ ────────────────────────

/** O recorte do `preapproval` que nos interessa. O resto a API pode mudar. */
export type PreapprovalDoMercadoPago = {
  id?: string
  status?: string
  external_reference?: string
  next_payment_date?: string | null
  auto_recurring?: { end_date?: string | null; frequency?: number; frequency_type?: string } | null
}

export type EstadoDoPlus = { status: PlusStatus; until: string | null }

/**
 * Traduz o estado da assinatura no Mercado Pago para o da conta.
 *
 * ── A regra que não é óbvia ─────────────────────────────────────────────────
 *
 * `pending` **não** libera nada. É o estado de quem começou a assinar e ainda
 * não autorizou o débito, e tratá-lo como ativo entregaria o Synse+ a quem
 * abriu o checkout e desistiu.
 *
 * ── Até quando o acesso vale ────────────────────────────────────────────────
 *
 * Até a próxima cobrança, que é o fim do ciclo pago. Sem essa data a 0036
 * recusa a escrita — e com razão: estado com prazo sem prazo seria acesso sem
 * fim, porque a rotina de expiração não teria o que comparar.
 *
 * Quando o Mercado Pago não manda `next_payment_date` num estado que exige
 * prazo, caímos em `EXPIRED` em vez de inventar uma data. Perder um dia de
 * acesso de quem pagou é um aborrecimento que o suporte resolve; conceder
 * acesso perpétuo por um campo ausente é uma conta que ninguém fecha.
 */
export function estadoDoPlus(
  preapproval: PreapprovalDoMercadoPago,
  agora: Date = new Date(),
): EstadoDoPlus {
  const prazo = preapproval.next_payment_date ?? preapproval.auto_recurring?.end_date ?? null
  const futuro = prazo !== null && new Date(prazo).getTime() > agora.getTime()

  switch (preapproval.status) {
    case 'authorized':
      // Autorizada mas com a data no passado: o ciclo venceu e a renovação
      // ainda não entrou. Não é cancelamento, e também não é acesso.
      return prazo && futuro
        ? { status: 'ACTIVE', until: prazo }
        : { status: 'EXPIRED', until: null }

    case 'paused':
      /*
       * Pausada é cobrança que falhou, não desistência. Os Termos prometem o
       * ciclo já pago, então o acesso segue até o fim dele — depois disso a
       * própria data derruba, sem precisar de outro evento.
       */
      return prazo && futuro
        ? { status: 'CANCELED', until: prazo }
        : { status: 'EXPIRED', until: null }

    case 'cancelled':
      /*
       * Cancelar interrompe a renovação seguinte, não o que já foi pago — a
       * mesma regra que o cadeado da 0038 já testa. Sem data restante, acabou.
       */
      return prazo && futuro
        ? { status: 'CANCELED', until: prazo }
        : { status: 'EXPIRED', until: null }

    case 'pending':
      return { status: 'NONE', until: null }

    default:
      /*
       * Estado que este código não conhece não vira acesso por omissão. É a
       * mesma escolha de `lerAssinatura` em `plans/subscription.ts`, e pelo
       * mesmo motivo: o desconhecido tem que custar acesso, nunca concedê-lo.
       */
      return { status: 'NONE', until: null }
  }
}
