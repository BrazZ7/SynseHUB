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

/**
 * ── O PIX de mentira ─────────────────────────────────────────────────────────
 *
 * O pior defeito que o app teve para o usuário, e ele passou despercebido
 * porque a pergunta que a tela fazia era plausível: "o provedor aceita PIX?".
 * O simulado aceita. Então a tela do aluno mostrava "PAGAR AGORA", gerava um
 * BR Code terminado em `6304MOCK`, e a pessoa colava no banco — que recusava.
 * Botão desativado é ruim; botão que parece ter funcionado é pior, porque a
 * pessoa culpa o próprio banco antes de culpar o app.
 *
 * A pergunta certa é outra, e é a que estes testes prendem.
 */
describe('cobrança real disponível', () => {
  afterEach(() => vi.unstubAllEnvs())

  async function comBanco(configurado: boolean) {
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', configurado ? 'https://x.supabase.co' : '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', configurado ? 'sb_publishable_x' : '')
    return import('@/lib/payments')
  }

  it('em cima de um banco real, o simulado não cobra', async () => {
    const { cobrancaIndisponivel } = await comBanco(true)
    expect(cobrancaIndisponivel()).toBe('sem-provedor')
  })

  it('na demonstração, cobra — o dinheiro falso ali é o ponto', async () => {
    /*
     * Sem banco conectado tudo na tela é demonstração e o app diz isso.
     * Travar o PIX ali tiraria da demonstração justamente a parte que uma dona
     * de academia quer ver antes de assinar.
     */
    const { cobrancaIndisponivel } = await comBanco(false)
    expect(cobrancaIndisponivel()).toBeNull()
  })

  it('não é a mesma pergunta que "o provedor aceita PIX"', async () => {
    // É esta confusão que produziu o defeito: o simulado aceita PIX.
    const { getPaymentProvider, cobrancaIndisponivel } = await comBanco(true)

    expect(getPaymentProvider().supportedMethods).toContain('PIX')
    expect(cobrancaIndisponivel()).toBe('sem-provedor')
  })
})

describe('a ação do aluno recusa no servidor', () => {
  const COBRANCA = {
    id: '11111111-1111-1111-1111-111111111111',
    amount: 84.9,
    dueDate: '2026-10-08',
    description: 'Mensalidade',
  }

  async function chamar() {
    const criarPix = vi.fn(async () => ({
      pix: { payload: 'nao-deveria-chegar-aqui', expiresAt: '2026-10-08T00:00:00Z' },
    }))

    vi.doMock('@/lib/auth/require-session', () => ({
      requireStudentSession: async () => ({ organizationId: 'org-1', studentId: 'stu-1' }),
    }))
    vi.doMock('@/lib/database', () => ({
      getDataSource: async () => ({ getChargesForStudent: async () => [COBRANCA] }),
    }))
    vi.doMock('@/lib/payments', async () => {
      const real = await vi.importActual<typeof import('@/lib/payments')>('@/lib/payments')
      return { ...real, getPaymentProvider: () => ({ createPix: criarPix }) }
    })

    const { createStudentPixAction } = await import('@/features/payments/student-actions')
    const form = new FormData()
    form.set('chargeId', COBRANCA.id)
    return { estado: await createStudentPixAction({ status: 'idle' }, form), criarPix }
  }

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.doUnmock('@/lib/auth/require-session')
    vi.doUnmock('@/lib/database')
    vi.doUnmock('@/lib/payments')
  })

  /*
   * O caminho feliz vem primeiro, e não é enfeite: sem ele o teste de baixo
   * passaria com a trava removida, porque a ação quebraria antes de chegar ao
   * provedor por qualquer outro motivo. Foi o que aconteceu na primeira versão
   * deste arquivo — a mutação que apagava a trava deixou tudo verde.
   */
  it('controle: com o banco desconectado, a demonstração gera o PIX', async () => {
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')

    const { estado, criarPix } = await chamar()

    expect(criarPix).toHaveBeenCalledOnce()
    expect(estado.status).toBe('success')
  })

  it('com banco real e sem provedor, recusa sem chamar o provedor', async () => {
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://x.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'sb_publishable_x')

    const { estado, criarPix } = await chamar()

    expect(estado.status).toBe('error')
    // O que mais importa: nada foi gerado. Uma recusa que ainda chamasse o
    // provedor teria entregue o código falso junto com a mensagem.
    expect(criarPix).not.toHaveBeenCalled()
  })
})
