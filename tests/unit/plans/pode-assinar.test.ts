import { describe, expect, it } from 'vitest'

import { mensagemDeNaoAssinar } from '@/features/plus/state'
import { podeAssinarPlus } from '@/lib/plans/pode-assinar'
import {
  lerAssinatura,
  SEM_ASSINATURA,
  type OrigemDaAssinatura,
  type PlusStatus,
} from '@/lib/plans/subscription'

/**
 * A trava da compra dupla.
 *
 * Com uma origem de cobrança, "já é assinante?" cabia num booleano. Com três,
 * **onde** a assinatura vive decide o que a tela pode fazer — e cada erro aqui
 * cobra alguém duas vezes pelo mesmo mês.
 *
 * O que esta trava **não** é: garantia. A compra na loja pode se completar sem
 * passar por servidor nenhum — a pessoa toca no preço, a folha nativa abre, a
 * Apple debita. A regra 3 da 0061 é o que impede isso de virar prejuízo de
 * quem pagou; esta trava é o que faz o caso ser raro.
 */

const DIA = 86_400_000
const AGORA = new Date('2026-10-17T12:00:00Z')
const daquiA = (dias: number) => new Date(AGORA.getTime() + dias * DIA).toISOString()
const haviaDias = (dias: number) => new Date(AGORA.getTime() - dias * DIA).toISOString()

const assinatura = (
  status: PlusStatus,
  until: string | null,
  origem: OrigemDaAssinatura | null,
) => ({ status, until, origem })

describe('quem não tem assinatura viva pode assinar', () => {
  it('conta nova', () => {
    expect(podeAssinarPlus({ assinatura: SEM_ASSINATURA, origemPretendida: 'apple', agora: AGORA }))
      .toEqual({ pode: true })
  })

  it('assinatura expirada', () => {
    expect(
      podeAssinarPlus({
        assinatura: assinatura('EXPIRED', null, 'mercadopago'),
        origemPretendida: 'apple',
        agora: AGORA,
      }),
    ).toEqual({ pode: true })
  })

  it('cancelada e com o prazo já vencido', () => {
    expect(
      podeAssinarPlus({
        assinatura: assinatura('CANCELED', haviaDias(1), 'apple'),
        origemPretendida: 'google',
        agora: AGORA,
      }),
    ).toEqual({ pode: true })
  })

  it('e ACTIVE com a data no passado também, porque a data é que manda', () => {
    /*
     * O caso que o `tier` erraria: o ciclo venceu ontem e a rotina de
     * expiração ainda não rodou. A conta está PRO na coluna e não está paga.
     * Recusar aqui seria impedir a pessoa de voltar a assinar.
     */
    expect(
      podeAssinarPlus({
        assinatura: assinatura('ACTIVE', haviaDias(1), 'mercadopago'),
        origemPretendida: 'mercadopago',
        agora: AGORA,
      }),
    ).toEqual({ pode: true })
  })
})

describe('quem já tem assinatura viva não compra de novo', () => {
  it('na mesma origem, é "você já tem" — no app, restaurar', () => {
    expect(
      podeAssinarPlus({
        assinatura: assinatura('ACTIVE', daquiA(20), 'apple'),
        origemPretendida: 'apple',
        agora: AGORA,
      }),
    ).toEqual({ pode: false, motivo: 'mesma-origem', origem: 'apple' })
  })

  it('em outra origem, a tela precisa dizer onde é a cobrança', () => {
    expect(
      podeAssinarPlus({
        assinatura: assinatura('ACTIVE', daquiA(20), 'apple'),
        origemPretendida: 'mercadopago',
        agora: AGORA,
      }),
    ).toEqual({ pode: false, motivo: 'outra-origem', origem: 'apple' })
  })

  it('no teste grátis também — ele é assinatura, e o cartão já está preso', () => {
    expect(
      podeAssinarPlus({
        assinatura: assinatura('TRIAL', daquiA(25), 'google'),
        origemPretendida: 'apple',
        agora: AGORA,
      }),
    ).toMatchObject({ pode: false, motivo: 'outra-origem' })
  })

  it('cancelada mas dentro do prazo pago: ainda é assinatura', () => {
    /*
     * Aqui estava o erro mais fácil de cometer: tratar CANCELED como vaga
     * livre. Quem cancelou pagou o mês corrente, e vender outra assinatura
     * dentro dele cobra duas vezes pelo mesmo período.
     */
    expect(
      podeAssinarPlus({
        assinatura: assinatura('CANCELED', daquiA(8), 'mercadopago'),
        origemPretendida: 'apple',
        agora: AGORA,
      }),
    ).toEqual({ pode: false, motivo: 'outra-origem', origem: 'mercadopago' })
  })

  it('origem desconhecida recusa — na dúvida sobre cobrança, não cobrar', () => {
    /*
     * Acontece de verdade: entre o deploy e a 0061 subir, `plus_provider` não
     * existe e a leitura devolve nulo. Permitir comprar nesse intervalo
     * cobraria de quem já paga.
     */
    expect(
      podeAssinarPlus({
        assinatura: assinatura('ACTIVE', daquiA(20), null),
        origemPretendida: 'apple',
        agora: AGORA,
      }),
    ).toEqual({ pode: false, motivo: 'origem-desconhecida', origem: null })
  })
})

describe('a leitura da origem, vinda do banco', () => {
  it('reconhece as três', () => {
    for (const origem of ['mercadopago', 'apple', 'google'] as const) {
      expect(lerAssinatura({ plus_status: 'ACTIVE', plus_provider: origem }).origem).toBe(origem)
    }
  })

  it('nome que este código não conhece vira nulo, não passa adiante', () => {
    // Inclusive a caixa errada, que é o erro que o comentário da 0036 induzia.
    for (const bruto of ['APPLE', 'stripe', 'asaas', '']) {
      expect(lerAssinatura({ plus_status: 'ACTIVE', plus_provider: bruto }).origem).toBeNull()
    }
  })

  it('coluna ausente vira nulo — a 0061 pode não ter subido', () => {
    expect(lerAssinatura({ plus_status: 'ACTIVE' }).origem).toBeNull()
  })

  it('e a recusa por origem desconhecida é consequência disso', () => {
    // Amarra as duas pontas: coluna ausente no banco → compra recusada.
    const lida = lerAssinatura({ plus_status: 'ACTIVE', plus_until: daquiA(20) })
    expect(
      podeAssinarPlus({ assinatura: lida, origemPretendida: 'apple', agora: AGORA }).pode,
    ).toBe(false)
  })
})

describe('o que a pessoa lê', () => {
  it('a mensagem de outra origem nomeia a loja, e não oferece compra', () => {
    const texto = mensagemDeNaoAssinar({
      pode: false,
      motivo: 'outra-origem',
      origem: 'apple',
    })
    expect(texto).toContain('App Store')
    /*
     * Nenhum caminho de pagamento na frase. Mandar a pessoa pagar fora da
     * loja, de dentro do app, é o que Apple e Google proíbem — e a frase é a
     * mesma nos dois lugares.
     */
    expect(texto).not.toMatch(/http|synse\.com\.br|assine|comprar|pagar agora/i)
  })

  it('cada motivo tem frase própria, e nenhuma é vazia', () => {
    /*
     * **A mesma origem nos dois primeiros, de propósito.** A primeira versão
     * deste teste usava `apple` e `google`, e o mutante que faz
     * `mesma-origem` devolver a frase de `outra-origem` sobreviveu: as frases
     * continuavam diferentes porque o nome da loja era diferente. A distinção
     * tem de vir do motivo, não do rótulo.
     */
    const motivos = [
      { pode: false, motivo: 'mesma-origem', origem: 'apple' },
      { pode: false, motivo: 'outra-origem', origem: 'apple' },
      { pode: false, motivo: 'origem-desconhecida', origem: null },
    ] as const

    const frases = motivos.map((v) => mensagemDeNaoAssinar(v))
    expect(new Set(frases).size).toBe(3)
    for (const frase of frases) expect(frase.length).toBeGreaterThan(20)
  })

  it('e ela recusa ser chamada para quem pode assinar', () => {
    // Controle: se passasse, uma tela mostraria recusa a quem não foi recusado.
    expect(() => mensagemDeNaoAssinar({ pode: true })).toThrow()
  })
})
