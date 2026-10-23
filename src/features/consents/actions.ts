'use server'

import { revalidatePath } from 'next/cache'

import { requireSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { isPendingMigration } from '@/lib/database/pending-migration'
import { logger } from '@/lib/logger'
import type { ConsentActionState } from '@/features/consents/state'
import type { ConsentType } from '@/types/domain'

const TIPOS: readonly ConsentType[] = [
  'TERMS_OF_USE',
  'PRIVACY_POLICY',
  'HEALTH_DATA_PROCESSING',
  'MARKETING_COMMUNICATION',
  'PROGRESS_PHOTOS',
  'RANKING_VISIBILITY',
]

function parseTipo(valor: unknown): ConsentType | null {
  const texto = String(valor ?? '')
  return (TIPOS as readonly string[]).includes(texto) ? (texto as ConsentType) : null
}

/**
 * Aceitar ou revogar um consentimento.
 *
 * A versão do documento não vem daqui: `record_consent` a resolve no banco. Se
 * viesse do formulário, o registro provaria apenas o que o navegador quis
 * dizer — e é justamente esse registro que precisa valer como prova.
 */
export async function recordConsentAction(
  _state: ConsentActionState,
  formData: FormData,
): Promise<ConsentActionState> {
  const session = await requireSession()

  const consentType = parseTipo(formData.get('consentType'))
  if (!consentType) return { error: 'Consentimento desconhecido.' }

  const accepted = String(formData.get('accepted')) === 'true'

  try {
    const dataSource = await getDataSource()
    await dataSource.recordConsent({ consentType, accepted })
  } catch (error) {
    const mensagem = String(error)
    if (mensagem.includes('não pode ser revogado')) {
      return { error: 'Para retirar este consentimento é preciso encerrar a conta.' }
    }
    if (isPendingMigration(error)) {
      return { error: 'O registro de consentimento ainda está sendo liberado nesta conta.' }
    }
    logger.error('consents:record_failed', {
      userProfileId: session.userProfileId,
      consentType,
      error: mensagem.slice(0, 200),
    })
    return { error: 'Não foi possível registrar agora. Tente novamente.' }
  }

  revalidatePath('/app/profile')
  return { message: accepted ? 'Autorização registrada.' : 'Autorização retirada.' }
}

/**
 * Registra o aceite de termos e privacidade no momento do cadastro.
 *
 * A tela de cadastro já dizia "ao criar a conta você concorda com os Termos de
 * Uso e a Política de Privacidade" — e nada era guardado. A frase sozinha não
 * prova nada: a LGPD põe no controlador o ônus de demonstrar o consentimento.
 *
 * Falha aqui não derruba o cadastro. A conta acabou de ser criada, e desfazer
 * tudo porque o carimbo não gravou seria trocar um problema por outro pior; o
 * que fica é o registro ausente, visível na própria tela de privacidade, onde
 * a pessoa pode confirmar.
 */
export async function recordSignupConsents(): Promise<void> {
  try {
    const dataSource = await getDataSource()
    await dataSource.recordConsent({ consentType: 'TERMS_OF_USE', accepted: true })
    await dataSource.recordConsent({ consentType: 'PRIVACY_POLICY', accepted: true })
  } catch (error) {
    logger.error('consents:signup_record_failed', { error: String(error).slice(0, 200) })
  }
}
