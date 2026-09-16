'use server'

import { requireStudentSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { AppError, notFound, toUserMessage } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { getPaymentProvider } from '@/lib/payments'
import { rateLimit } from '@/lib/rate-limit'
import { createPixSchema } from '@/lib/validations/payment'
import type { PaymentActionState } from '@/features/payments/state'

/**
 * Gera o PIX da própria mensalidade, a partir do Synse App.
 *
 * A cobrança precisa pertencer ao aluno da sessão — o vínculo é verificado no
 * servidor, nunca aceito do formulário.
 */
export async function createStudentPixAction(
  _state: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const session = await requireStudentSession()

  try {
    const parsed = createPixSchema.safeParse({ chargeId: formData.get('chargeId') })
    if (!parsed.success) return { status: 'error', message: 'Cobrança inválida.' }

    const limit = rateLimit(`student-pix:${session.studentId}`, 10, 60_000)
    if (!limit.allowed) {
      return { status: 'error', message: 'Aguarde um instante antes de gerar outro código.' }
    }

    const dataSource = await getDataSource()
    const charges = await dataSource.getChargesForStudent(session.organizationId, session.studentId)
    const charge = charges.find((item) => item.id === parsed.data.chargeId)
    if (!charge) throw notFound('cobrança')

    const provider = getPaymentProvider()
    const pix = await provider.createPix({
      providerCustomerId: session.studentId,
      amount: charge.amount,
      dueDate: charge.dueDate,
      description: charge.description,
      externalReference: charge.id,
    })

    logger.info('payments:student_pix', {
      organizationId: session.organizationId,
      studentId: session.studentId,
      chargeId: charge.id,
    })

    return {
      status: 'success',
      message: 'PIX gerado.',
      pix: { payload: pix.pix.payload, expiresAt: pix.pix.expiresAt },
    }
  } catch (error) {
    if (!(error instanceof AppError)) {
      logger.error('payments:student_pix_failed', { error: String(error) })
    }
    return { status: 'error', message: toUserMessage(error) }
  }
}
