import { describe, expect, it } from 'vitest'

// Utilitário em .mjs, sem tipos: só lê o arquivo de ambiente.
import { loadEnvFile } from '../../scripts/lib/env-file.mjs'

import { AsaasPaymentProvider } from '@/lib/payments/providers/asaas'

/**
 * Exercita o adapter contra o sandbox real do Asaas.
 *
 * Os testes unitários provam a tradução; este prova que a API concorda com ela.
 * São coisas diferentes: um campo renomeado pelo provedor passa nos unitários e
 * quebra aqui — que é exatamente o erro que só apareceria com dinheiro real
 * envolvido.
 *
 * Sem ASAAS_API_KEY tudo pula, para não travar quem só quer rodar a suíte.
 *
 * Rode com:  npm run test:asaas
 */

loadEnvFile('.env.local')

const apiKey = process.env.ASAAS_API_KEY?.trim()
const apiUrl = process.env.ASAAS_API_URL?.trim() || 'https://api-sandbox.asaas.com/v3'

/*
 * Recusa apontar para produção. Este arquivo cria cobranças de verdade; num
 * ambiente real elas iriam parar na fatura de alguém.
 */
const ehSandbox = apiUrl.includes('sandbox')

if (!apiKey) {
  console.warn('\n⚠ ASAAS_API_KEY ausente — testes de integração do Asaas pulados.\n')
} else if (!ehSandbox) {
  console.warn(`\n⚠ ASAAS_API_URL não é sandbox (${apiUrl}) — testes pulados por segurança.\n`)
}

const rodar = Boolean(apiKey) && ehSandbox
const marca = `synse-test-${Date.now()}`

/** Data de vencimento à frente: o Asaas recusa cobrança vencida. */
function vencimentoFuturo(dias = 7) {
  const data = new Date()
  data.setDate(data.getDate() + dias)
  return data.toISOString().slice(0, 10)
}

/**
 * Os testes seguintes dependem da cobrança criada. Sem essa guarda, a falha de
 * um vira quatro, e a mensagem que importa — a primeira — some no meio das
 * outras três reclamando de `undefined`.
 */
function exigirCobranca(): never {
  throw new Error('Cobrança não foi criada: corrija a falha anterior primeiro.')
}

/** Consulta crua, para a mensagem de falha mostrar o que o Asaas respondeu. */
async function buscarBruto(id: string): Promise<Record<string, unknown>> {
  const resposta = await fetch(`${apiUrl}/payments/${id}`, {
    headers: { access_token: apiKey ?? '' },
    cache: 'no-store',
  })
  return (await resposta.json()) as Record<string, unknown>
}

describe.skipIf(!rodar)('Asaas · sandbox', () => {
  const provider = new AsaasPaymentProvider({ apiUrl, apiKey })
  let customerId = ''
  let chargeId = ''

  it('cria um cliente', async () => {
    const cliente = await provider.createCustomer({
      name: 'Aluno de Teste Synse',
      email: `${marca}@exemplo.com`,
      taxId: '24971563792', // CPF de teste publicado pelo Asaas
      externalReference: marca,
    })

    expect(cliente.providerCustomerId).toMatch(/^cus_/)
    customerId = cliente.providerCustomerId
  })

  it('cria uma cobrança PIX e devolve o copia-e-cola', async () => {
    const cobranca = await provider.createPix({
      providerCustomerId: customerId,
      amount: 99.9,
      dueDate: vencimentoFuturo(),
      description: 'Mensalidade — teste de integração',
      externalReference: marca,
    })

    expect(cobranca.status).toBe('PENDING')
    expect(cobranca.pix.payload.length).toBeGreaterThan(50)
    expect(cobranca.pix.qrCodeBase64.length).toBeGreaterThan(100)
    chargeId = cobranca.providerChargeId
  })

  it('lê a cobrança de volta com o mesmo valor e status', async () => {
    if (!chargeId) return exigirCobranca()
    const cobranca = await provider.getPayment(chargeId)

    expect(cobranca.providerChargeId).toBe(chargeId)
    expect(cobranca.amount).toBe(99.9)
    expect(cobranca.status).toBe('PENDING')
  })

  /*
   * O split é o que faz a comissão da plataforma existir. Um campo errado aqui
   * não dá erro: o dinheiro simplesmente vai inteiro para a academia.
   */
  it('aceita o formato de split que o adapter monta', async () => {
    if (!chargeId) return exigirCobranca()

    const walletId = process.env.ASAAS_TEST_WALLET_ID?.trim()
    if (!walletId) {
      console.warn('  (sem ASAAS_TEST_WALLET_ID — split não verificado)')
      return
    }

    await expect(
      provider.configureSplit(chargeId, {
        providerAccountId: walletId,
        platformPercentage: 2,
        platformFixedFee: 0,
      }),
    ).resolves.toBeUndefined()
  })

  it('cancela a cobrança criada, sem deixar rastro no sandbox', async () => {
    if (!chargeId) return exigirCobranca()

    await expect(provider.cancelCharge(chargeId)).resolves.toBeUndefined()

    const cobranca = await provider.getPayment(chargeId)
    const bruto = await buscarBruto(chargeId)

    /*
     * A mensagem carrega o que o Asaas respondeu de fato. Se um dia o campo
     * mudar de novo, a falha já diz qual é a nova forma, sem precisar de outra
     * rodada de investigação.
     */
    expect(
      cobranca.status,
      `Asaas devolveu ${JSON.stringify({ status: bruto.status, deleted: bruto.deleted })}`,
    ).toBe('CANCELLED')
  })
})
