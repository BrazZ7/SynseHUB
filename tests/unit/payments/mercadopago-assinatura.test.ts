import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import {
  conferirAssinatura,
  estadoDoPlus,
  lerAssinatura,
  montarManifest,
} from '@/lib/payments/providers/mercadopago/assinatura'

/**
 * ── O que decide quem vira assinante ────────────────────────────────────────
 *
 * Duas coisas, e as duas moram aqui: a conferência da assinatura do webhook e
 * a tradução do estado do Mercado Pago para o estado da conta.
 *
 * São funções puras de propósito. A credencial do Mercado Pago não existe
 * neste repositório — e não pode existir —, então a alternativa a testar isto
 * assim seria não testar.
 */

const SEGREDO = 'segredo-do-painel'
const AGORA = new Date('2026-10-01T12:00:00Z')
const TS = String(Math.floor(AGORA.getTime() / 1000))

function assinar(dataId: string, requestId: string, ts = TS, segredo = SEGREDO) {
  const v1 = createHmac('sha256', segredo)
    .update(montarManifest({ dataId, requestId, ts }))
    .digest('hex')
  return `ts=${ts},v1=${v1}`
}

describe('o cabeçalho x-signature', () => {
  it('separa ts e v1', () => {
    expect(lerAssinatura('ts=123,v1=abc')).toEqual({ ts: '123', v1: 'abc' })
  })

  it('tolera espaço e ordem trocada', () => {
    expect(lerAssinatura(' v1=abc , ts=123 ')).toEqual({ ts: '123', v1: 'abc' })
  })

  it('devolve nulo quando falta uma das partes', () => {
    expect(lerAssinatura('ts=123')).toBeNull()
    expect(lerAssinatura('')).toBeNull()
    expect(lerAssinatura(null)).toBeNull()
  })
})

describe('o manifesto', () => {
  it('tem a pontuação exata que o Mercado Pago assina', () => {
    expect(montarManifest({ dataId: 'ABC', requestId: 'req-1', ts: '99' })).toBe(
      'id:abc;request-id:req-1;ts:99;',
    )
  })

  it('baixa a caixa do id, porque é assim que eles normalizam', () => {
    expect(montarManifest({ dataId: 'AbC', requestId: 'r', ts: '1' })).toContain('id:abc;')
  })
})

describe('a conferência da assinatura', () => {
  const base = { requestId: 'req-1', dataId: '123', segredo: SEGREDO, agora: AGORA }

  it('aceita a assinatura legítima', () => {
    const header = assinar('123', 'req-1')
    expect(conferirAssinatura({ ...base, header })).toEqual({ valida: true })
  })

  it('recusa quando o segredo é outro', () => {
    const header = assinar('123', 'req-1', TS, 'outro-segredo')
    expect(conferirAssinatura({ ...base, header })).toEqual({ valida: false, motivo: 'nao-confere' })
  })

  it('recusa quando o id não é o que foi assinado', () => {
    /*
     * O ataque direto: pegar um webhook legítimo de outra assinatura e trocar
     * o id para o da sua. A assinatura cobre o id, então não cola.
     */
    const header = assinar('123', 'req-1')
    expect(conferirAssinatura({ ...base, header, dataId: '999' })).toEqual({
      valida: false,
      motivo: 'nao-confere',
    })
  })

  it('recusa quando o request-id não bate', () => {
    const header = assinar('123', 'req-1')
    expect(conferirAssinatura({ ...base, header, requestId: 'req-2' })).toEqual({
      valida: false,
      motivo: 'nao-confere',
    })
  })

  it('recusa requisição velha, contra reenvio', () => {
    /*
     * Sem isto, uma requisição legítima capturada continuaria válida para
     * sempre — o carimbo entra no texto assinado, mas nada obriga a olhá-lo.
     */
    const velho = String(Math.floor(AGORA.getTime() / 1000) - 3600)
    const header = assinar('123', 'req-1', velho)
    expect(conferirAssinatura({ ...base, header })).toEqual({ valida: false, motivo: 'velha' })
  })

  it('aceita dentro da tolerância de atraso de rede', () => {
    const quaseVelho = String(Math.floor(AGORA.getTime() / 1000) - 120)
    const header = assinar('123', 'req-1', quaseVelho)
    expect(conferirAssinatura({ ...base, header })).toEqual({ valida: true })
  })

  it('recusa sem segredo configurado, em vez de aceitar por omissão', () => {
    const header = assinar('123', 'req-1')
    expect(conferirAssinatura({ ...base, header, segredo: '' })).toEqual({
      valida: false,
      motivo: 'sem-segredo',
    })
  })

  it('recusa sem id na query string', () => {
    const header = assinar('123', 'req-1')
    expect(conferirAssinatura({ ...base, header, dataId: null })).toEqual({
      valida: false,
      motivo: 'sem-id',
    })
  })

  it('recusa sem cabeçalho nenhum', () => {
    expect(conferirAssinatura({ ...base, header: null })).toEqual({
      valida: false,
      motivo: 'sem-assinatura',
    })
  })
})

describe('do estado do Mercado Pago para o do Synse+', () => {
  const AMANHA = new Date(AGORA.getTime() + 86_400_000).toISOString()
  const ONTEM = new Date(AGORA.getTime() - 86_400_000).toISOString()

  it('autorizada e em dia vira ACTIVE até a próxima cobrança', () => {
    expect(estadoDoPlus({ status: 'authorized', next_payment_date: AMANHA }, AGORA)).toEqual({
      status: 'ACTIVE',
      until: AMANHA,
    })
  })

  it('autorizada com a data vencida não é acesso', () => {
    // O ciclo acabou e a renovação não entrou. "authorized" sozinho não basta.
    expect(estadoDoPlus({ status: 'authorized', next_payment_date: ONTEM }, AGORA)).toEqual({
      status: 'EXPIRED',
      until: null,
    })
  })

  it('autorizada sem data nenhuma também não', () => {
    /*
     * O caso que mais importa: sem data a 0036 recusaria a escrita, e inventar
     * uma concederia acesso que ninguém sabe quando acaba.
     */
    expect(estadoDoPlus({ status: 'authorized' }, AGORA)).toEqual({ status: 'EXPIRED', until: null })
  })

  it('cancelada dentro do período pago continua valendo', () => {
    // Mesma promessa que o cadeado da 0038 já testa: cancelar não tira o que
    // já foi pago.
    expect(estadoDoPlus({ status: 'cancelled', next_payment_date: AMANHA }, AGORA)).toEqual({
      status: 'CANCELED',
      until: AMANHA,
    })
  })

  it('cancelada e vencida acabou', () => {
    expect(estadoDoPlus({ status: 'cancelled', next_payment_date: ONTEM }, AGORA)).toEqual({
      status: 'EXPIRED',
      until: null,
    })
  })

  it('pausada é cobrança que falhou, e o ciclo pago segue', () => {
    expect(estadoDoPlus({ status: 'paused', next_payment_date: AMANHA }, AGORA)).toEqual({
      status: 'CANCELED',
      until: AMANHA,
    })
  })

  it('pendente não libera nada', () => {
    /*
     * Quem abriu o checkout e não autorizou o débito. Tratar como ativo
     * entregaria o Synse+ a quem desistiu no meio.
     */
    expect(estadoDoPlus({ status: 'pending', next_payment_date: AMANHA }, AGORA)).toEqual({
      status: 'NONE',
      until: null,
    })
  })

  it('estado desconhecido não vira acesso por omissão', () => {
    expect(estadoDoPlus({ status: 'alguma_coisa_nova', next_payment_date: AMANHA }, AGORA)).toEqual({
      status: 'NONE',
      until: null,
    })
    expect(estadoDoPlus({}, AGORA)).toEqual({ status: 'NONE', until: null })
  })

  it('cai para end_date quando não há próxima cobrança', () => {
    expect(
      estadoDoPlus({ status: 'cancelled', auto_recurring: { end_date: AMANHA } }, AGORA),
    ).toEqual({ status: 'CANCELED', until: AMANHA })
  })
})
