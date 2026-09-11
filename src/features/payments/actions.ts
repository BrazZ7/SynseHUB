'use server'

import { revalidatePath } from 'next/cache'

import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { AppError, notFound, toUserMessage } from '@/lib/errors'
import { logger } from '@/lib/logger'
import type { PaymentProvider } from '@/lib/payments/provider'
import {
  getProviderForOrganization,
  getSplitForOrganization,
} from '@/lib/payments/organization-provider'
import { requirePermission } from '@/lib/permissions/guard'
import { rateLimit } from '@/lib/rate-limit'
import {
  collectionActionSchema,
  createPixSchema,
  manualPaymentSchema,
} from '@/lib/validations/payment'
import type { PaymentActionState } from '@/features/payments/state'

/**
 * Baixa manual de mensalidade (dinheiro na recepção, PIX conferido no extrato).
 *
 * Confirmação vinda do provedor NUNCA passa por aqui — essa só entra pelo
 * webhook validado. Esta ação existe para o pagamento que acontece fora do
 * Synse Pay e é sempre registrada com o autor.
 */
export async function registerManualPaymentAction(
  _state: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const session = await requireHubSession()

  try {
    requirePermission(session, 'finance:write')

    const parsed = manualPaymentSchema.safeParse({
      chargeId: formData.get('chargeId'),
      method: formData.get('method') ?? 'CASH',
      note: formData.get('note') ?? '',
    })
    if (!parsed.success)
      return { status: 'error', message: 'Selecione uma forma de pagamento válida.' }

    const dataSource = await getDataSource()
    const charge = await dataSource.markChargeAsPaid(session.organizationId, parsed.data.chargeId, {
      method: parsed.data.method,
      paidAt: new Date().toISOString(),
    })
    if (!charge) throw notFound('cobrança')

    logger.info('payments:manual_settlement', {
      organizationId: session.organizationId,
      chargeId: charge.id,
      actorId: session.userProfileId,
      method: parsed.data.method,
    })

    revalidatePath('/finance')
    revalidatePath('/finance/overdue')
    revalidatePath('/dashboard')

    return { status: 'success', message: 'Pagamento registrado.' }
  } catch (error) {
    if (!(error instanceof AppError))
      logger.error('payments:manual_failed', { error: String(error) })
    return { status: 'error', message: toUserMessage(error) }
  }
}

/**
 * Garante que o aluno exista como cliente no provedor.
 *
 * O provedor identifica o pagador por um id próprio (`cus_...` no Asaas) e
 * exige CPF para emitir cobrança. A referência é guardada na primeira vez:
 * criar um cliente novo a cada PIX encheria a conta da academia de duplicatas
 * e quebraria o histórico do pagador.
 */
async function ensureProviderCustomer(input: {
  dataSource: Awaited<ReturnType<typeof getDataSource>>
  provider: PaymentProvider
  organizationId: string
  studentId: string
}): Promise<string> {
  const existente = await input.dataSource.getProviderCustomerId(
    input.organizationId,
    input.studentId,
    input.provider.id,
  )
  if (existente) return existente

  const student = await input.dataSource.getStudent(input.organizationId, input.studentId)
  if (!student) throw notFound('aluno')

  const criado = await input.provider.createCustomer({
    name: student.name,
    email: student.email,
    phone: student.phone,
    taxId: student.taxId,
    externalReference: student.id,
  })

  await input.dataSource.saveProviderCustomerId({
    organizationId: input.organizationId,
    studentId: input.studentId,
    provider: input.provider.id,
    providerCustomerId: criado.providerCustomerId,
  })

  return criado.providerCustomerId
}

/** Gera um PIX de cobrança pelo provedor configurado. */
export async function createPixChargeAction(
  _state: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const session = await requireHubSession()

  try {
    requirePermission(session, 'finance:write')

    const parsed = createPixSchema.safeParse({ chargeId: formData.get('chargeId') })
    if (!parsed.success) return { status: 'error', message: 'Cobrança inválida.' }

    const limit = rateLimit(`pix:${session.organizationId}`, 30, 60_000)
    if (!limit.allowed) {
      return { status: 'error', message: 'Muitas gerações seguidas. Aguarde um instante.' }
    }

    const dataSource = await getDataSource()
    const charges = await dataSource.listCharges(session.organizationId, {
      status: 'ALL',
      limit: 20000,
    })
    const charge = charges.find((item) => item.id === parsed.data.chargeId)
    if (!charge) throw notFound('cobrança')

    /*
     * A cobrança sai pela subconta da academia, não por uma conta da
     * plataforma: o dinheiro do aluno cai direto na conta dela e o split
     * desvia só a comissão.
     */
    const provider = await getProviderForOrganization(session.organizationId)
    const providerCustomerId = await ensureProviderCustomer({
      dataSource,
      provider,
      organizationId: session.organizationId,
      studentId: charge.studentId,
    })

    const pix = await provider.createPix({
      providerCustomerId,
      amount: charge.amount,
      dueDate: charge.dueDate,
      description: charge.description,
      externalReference: charge.id,
      split: await getSplitForOrganization(session.organizationId),
    })

    /*
     * Guardar o id do provedor é o que torna o pagamento confirmável.
     *
     * O webhook procura a cobrança por (provider, provider_charge_id). Sem esta
     * gravação o aluno paga, o provedor avisa, e o evento é descartado como
     * "cobrança não encontrada" — a mensalidade fica pendente para sempre.
     */
    await dataSource.attachProviderCharge({
      organizationId: session.organizationId,
      chargeId: charge.id,
      provider: provider.id,
      providerChargeId: pix.providerChargeId,
    })

    logger.info('payments:pix_created', {
      organizationId: session.organizationId,
      chargeId: charge.id,
      provider: provider.id,
      providerChargeId: pix.providerChargeId,
    })

    return {
      status: 'success',
      message: 'PIX gerado. O aluno pode pagar pelo código abaixo.',
      pix: { payload: pix.pix.payload, expiresAt: pix.pix.expiresAt },
    }
  } catch (error) {
    if (!(error instanceof AppError)) logger.error('payments:pix_failed', { error: String(error) })
    return { status: 'error', message: toUserMessage(error) }
  }
}

/** Registra um acionamento da régua de cobrança. */
export async function registerCollectionAttemptAction(
  _state: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const session = await requireHubSession()

  try {
    requirePermission(session, 'finance:write')

    const parsed = collectionActionSchema.safeParse({
      chargeId: formData.get('chargeId'),
      channel: formData.get('channel') ?? 'PUSH',
      note: formData.get('note') ?? '',
    })
    if (!parsed.success) return { status: 'error', message: 'Selecione um canal válido.' }

    logger.info('payments:collection_attempt', {
      organizationId: session.organizationId,
      chargeId: parsed.data.chargeId,
      channel: parsed.data.channel,
      actorId: session.userProfileId,
    })

    revalidatePath('/finance/overdue')
    return { status: 'success', message: 'Cobrança registrada no histórico do aluno.' }
  } catch (error) {
    return { status: 'error', message: toUserMessage(error) }
  }
}
