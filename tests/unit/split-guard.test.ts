import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Sem a carteira da plataforma a cobrança sai sem comissão — e nada na tela
 * indica isso: o painel continua exibindo os 2% como se tivessem sido retidos.
 *
 * Em produção é dinheiro perdido em silêncio, então a emissão precisa parar.
 * Em desenvolvimento precisa seguir, senão testar qualquer parte do fluxo exige
 * abrir uma segunda conta no provedor antes.
 *
 * Os dois lados estão presos aqui porque o erro de inverter isso é invisível
 * nos dois sentidos.
 */

const admin = {
  from: () => ({
    select: () => ({
      eq: () => ({ maybeSingle: async () => ({ data: { platform_fee_percentage: 2 } }) }),
    }),
  }),
}

async function carregar(ambiente: string, walletId?: string) {
  vi.resetModules()
  vi.stubEnv('SYNSE_PLATFORM_WALLET_ID', walletId ?? '')

  vi.doMock('@/config/app', () => ({ APP: { env: ambiente, url: 'https://synse.com.br' } }))
  vi.doMock('@/lib/database/supabase-admin', () => ({
    createSupabaseAdminClient: () => admin,
  }))
  vi.doMock('@/lib/payments', () => ({
    isSimulatedProvider: () => false,
    getPaymentProvider: () => ({ id: 'asaas' }),
  }))

  return import('@/lib/payments/organization-provider')
}

beforeEach(() => vi.resetModules())

afterEach(() => {
  vi.unstubAllEnvs()
  vi.doUnmock('@/config/app')
  vi.doUnmock('@/lib/database/supabase-admin')
  vi.doUnmock('@/lib/payments')
})

describe('getSplitForOrganization', () => {
  it('em produção, sem carteira, recusa emitir', async () => {
    const { getSplitForOrganization } = await carregar('production')

    await expect(getSplitForOrganization('org-1')).rejects.toMatchObject({
      code: 'platform_wallet_missing',
    })
  })

  it('fora de produção, sem carteira, segue sem split', async () => {
    const { getSplitForOrganization } = await carregar('development')

    await expect(getSplitForOrganization('org-1')).resolves.toBeUndefined()
  })

  it('com carteira, monta o split com o percentual do banco', async () => {
    const { getSplitForOrganization } = await carregar('production', 'wallet_synse')

    await expect(getSplitForOrganization('org-1')).resolves.toEqual({
      providerAccountId: 'wallet_synse',
      platformPercentage: 2,
      platformFixedFee: 0,
    })
  })
})
