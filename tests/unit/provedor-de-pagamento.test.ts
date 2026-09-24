import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * ── Sair do Asaas não pode virar cobrança silenciosa ─────────────────────────
 *
 * O adapter do Asaas foi removido por causa da taxa, e `PAYMENT_PROVIDER=asaas`
 * continua no ambiente da Vercel enquanto ninguém a apaga. Três coisas podiam
 * dar errado nesse meio-tempo, e cada uma é um teste aqui:
 *
 * 1. A aplicação derrubar por causa de uma variável obsoleta — trocaria um
 *    problema de cobrança por um de disponibilidade.
 * 2. Cair no simulado **em silêncio** — a pior das três, porque a tela de
 *    cobrança continuaria parecendo ligada e ninguém saberia olhando a sonda.
 * 3. Alguma emissão achar que emitiu quando não há provedor.
 */

async function carregar(provider?: string) {
  vi.resetModules()
  vi.stubEnv('PAYMENT_PROVIDER', provider ?? '')
  return import('@/lib/payments')
}

beforeEach(() => vi.resetModules())
afterEach(() => vi.unstubAllEnvs())

describe('fábrica do provedor', () => {
  it('sem configuração, é o simulado', async () => {
    const { getPaymentProvider, isSimulatedProvider, provedorDesconhecido } = await carregar()

    expect(getPaymentProvider().id).toBe('mock')
    expect(isSimulatedProvider()).toBe(true)
    expect(provedorDesconhecido()).toBeNull()
  })

  it('com um nome que não existe mais, não derruba — cai no simulado', async () => {
    // O caso real: a variável sobrando na Vercel depois da remoção do adapter.
    const { getPaymentProvider, isSimulatedProvider } = await carregar('asaas')

    expect(getPaymentProvider().id).toBe('mock')
    expect(isSimulatedProvider()).toBe(true)
  })

  it('mas denuncia o desencontro, em vez de cair calada', async () => {
    /*
     * É este o teste que importa. Sem ele, a fábrica cumpriria o de cima —
     * "não derruba" — sendo uma mentira: a sonda diria "mock" e ninguém
     * descobriria que a configuração pede outra coisa.
     */
    const { provedorConfigurado, provedorDesconhecido } = await carregar('asaas')

    expect(provedorConfigurado()).toBe('asaas')
    expect(provedorDesconhecido()).toBe('asaas')
  })

  it('não confunde maiúscula com provedor diferente', async () => {
    const { provedorConfigurado, provedorDesconhecido } = await carregar('MOCK')

    expect(provedorConfigurado()).toBe('mock')
    expect(provedorDesconhecido()).toBeNull()
  })
})

describe('provedor de uma academia', () => {
  afterEach(() => vi.doUnmock('@/lib/payments'))

  it('no simulado, devolve o provedor global', async () => {
    vi.resetModules()
    vi.doMock('@/lib/payments', () => ({
      isSimulatedProvider: () => true,
      getPaymentProvider: () => ({ id: 'mock' }),
    }))

    const { getProviderForOrganization } = await import('@/lib/payments/organization-provider')
    await expect(getProviderForOrganization('org-1')).resolves.toMatchObject({ id: 'mock' })
  })

  it('fora do simulado, recusa em vez de fingir que emitiu', async () => {
    /*
     * Hoje este caminho não acontece — não há provedor real. Ele existe para o
     * dia em que houver e alguém ligar a configuração antes do adapter: o erro
     * é melhor do que uma cobrança que a tela dá por emitida e não existe.
     */
    vi.resetModules()
    vi.doMock('@/lib/payments', () => ({
      isSimulatedProvider: () => false,
      getPaymentProvider: () => ({ id: 'gateway' }),
    }))

    const { getProviderForOrganization } = await import('@/lib/payments/organization-provider')
    await expect(getProviderForOrganization('org-1')).rejects.toMatchObject({
      code: 'payment_provider_missing',
    })
  })
})
