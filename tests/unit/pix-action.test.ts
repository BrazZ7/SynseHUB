import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A cobrança PIX é onde três coisas precisam acontecer juntas, e nenhuma delas
 * dá erro visível quando falta:
 *
 * - o cliente do provedor precisa existir (mandar o UUID do aluno no lugar só
 *   quebra na hora de cobrar de verdade);
 * - o `provider_charge_id` precisa ser gravado, senão o webhook não acha a
 *   cobrança e o pagamento nunca é confirmado;
 * - o split precisa ir junto, senão o dinheiro vai inteiro para a academia e a
 *   comissão simplesmente não existe.
 *
 * Os três são silenciosos em produção. Ficam presos aqui.
 */

const dataSource = {
  listCharges: vi.fn(),
  getStudent: vi.fn(),
  getProviderCustomerId: vi.fn(),
  saveProviderCustomerId: vi.fn(),
  attachProviderCharge: vi.fn(),
}

const provider = {
  id: 'asaas',
  createCustomer: vi.fn(),
  createPix: vi.fn(),
}

const split = { providerAccountId: 'wallet_synse', platformPercentage: 2, platformFixedFee: 0 }

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@/lib/auth/require-session', () => ({
  requireHubSession: async () => ({
    organizationId: 'org-1',
    userProfileId: 'perfil-1',
    role: 'OWNER',
  }),
}))

vi.mock('@/lib/permissions/permissions', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  requirePermission: () => {},
}))

vi.mock('@/lib/database', () => ({ getDataSource: async () => dataSource }))

vi.mock('@/lib/payments/organization-provider', () => ({
  getProviderForOrganization: async () => provider,
  getSplitForOrganization: async () => split,
}))

const { createPixChargeAction } = await import('@/features/payments/actions')

const COBRANCA = {
  id: 'cobranca-1',
  organizationId: 'org-1',
  studentId: 'aluno-1',
  amount: 149.9,
  dueDate: '2026-10-05',
  description: 'Mensalidade outubro',
  status: 'PENDING',
}

const ALUNO = {
  id: 'aluno-1',
  name: 'Joana Ribeiro',
  email: 'joana@exemplo.com',
  phone: '11988887777',
  taxId: '24971563792',
}

function formulario(chargeId = 'cobranca-1') {
  const dados = new FormData()
  dados.set('chargeId', chargeId)
  return dados
}

beforeEach(() => {
  vi.clearAllMocks()
  dataSource.listCharges.mockResolvedValue([COBRANCA])
  dataSource.getStudent.mockResolvedValue(ALUNO)
  dataSource.getProviderCustomerId.mockResolvedValue(null)
  provider.createCustomer.mockResolvedValue({ providerCustomerId: 'cus_123' })
  provider.createPix.mockResolvedValue({
    providerChargeId: 'pay_abc',
    status: 'PENDING',
    pix: { payload: '00020126...', qrCodeBase64: 'iVBOR', expiresAt: '2026-10-05T23:59:59Z' },
  })
})

describe('createPixChargeAction', () => {
  it('grava o id da cobrança no provedor — sem isso o webhook nunca confirma', async () => {
    await createPixChargeAction({ status: 'idle' }, formulario())

    expect(dataSource.attachProviderCharge).toHaveBeenCalledWith({
      organizationId: 'org-1',
      chargeId: 'cobranca-1',
      provider: 'asaas',
      providerChargeId: 'pay_abc',
    })
  })

  it('manda o split junto da cobrança', async () => {
    await createPixChargeAction({ status: 'idle' }, formulario())

    expect(provider.createPix).toHaveBeenCalledWith(expect.objectContaining({ split }))
  })

  it('cria o cliente no provedor e guarda a referência na primeira vez', async () => {
    await createPixChargeAction({ status: 'idle' }, formulario())

    expect(provider.createCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ email: ALUNO.email, taxId: ALUNO.taxId }),
    )
    expect(dataSource.saveProviderCustomerId).toHaveBeenCalledWith(
      expect.objectContaining({ providerCustomerId: 'cus_123' }),
    )
    expect(provider.createPix).toHaveBeenCalledWith(
      expect.objectContaining({ providerCustomerId: 'cus_123' }),
    )
  })

  /*
   * Duplicar o pagador a cada PIX enche a conta da academia de clientes
   * repetidos e quebra o histórico de quem pagou o quê.
   */
  it('reaproveita o cliente já existente, sem criar outro', async () => {
    dataSource.getProviderCustomerId.mockResolvedValue('cus_ja_existe')

    await createPixChargeAction({ status: 'idle' }, formulario())

    expect(provider.createCustomer).not.toHaveBeenCalled()
    expect(provider.createPix).toHaveBeenCalledWith(
      expect.objectContaining({ providerCustomerId: 'cus_ja_existe' }),
    )
  })

  it('nunca usa o id interno do aluno como cliente do provedor', async () => {
    await createPixChargeAction({ status: 'idle' }, formulario())

    const enviado = provider.createPix.mock.calls[0][0]
    expect(enviado.providerCustomerId).not.toBe(COBRANCA.studentId)
  })

  it('não inventa cobrança: id desconhecido não chega ao provedor', async () => {
    const estado = await createPixChargeAction({ status: 'idle' }, formulario('nao-existe'))

    expect(provider.createPix).not.toHaveBeenCalled()
    expect(estado.status).toBe('error')
  })
})
