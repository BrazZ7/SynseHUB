import 'server-only'

import { cookies } from 'next/headers'

import { logger } from '@/lib/logger'
import type { Charge, CheckIn, MembershipPlan, StudentStatus } from '@/types/domain'

/**
 * Diário de alterações da demonstração.
 *
 * O dataset base é determinístico e idêntico em qualquer processo, então não
 * precisa ser transportado. O que precisa viajar é o que o visitante mudou.
 *
 * Em ambiente serverless cada requisição pode cair numa execução diferente,
 * com a própria memória: uma escrita guardada em variável de módulo some na
 * navegação seguinte. Guardando as alterações num cookie, elas acompanham o
 * visitante e são reaplicadas sobre o dataset base a cada leitura.
 *
 * Efeito colateral desejado: cada pessoa que abre o link tem a própria
 * demonstração isolada, sem interferir na de quem mais estiver testando.
 */

export const DEMO_JOURNAL_COOKIE = 'synse_demo_state'

/** Chaves curtas de propósito: o orçamento do cookie é de 4 KB. */
export type DemoMutation =
  | {
      /** Matrícula de aluno. */
      t: 'student'
      id: string
      profileId: string
      synseId: string
      name: string
      email: string
      phone: string | null
      goal: string | null
      planId: string | null
      trainerId: string | null
      billingDay: number
      membershipId: string | null
      chargeId: string | null
      at: string
    }
  | {
      /** Baixa de cobrança. */
      t: 'paid'
      chargeId: string
      method: NonNullable<Charge['paymentMethod']>
      at: string
    }
  | {
      /** Criação de plano. */
      t: 'plan'
      id: string
      name: string
      description: string | null
      price: number
      billingCycle: MembershipPlan['billingCycle']
      enrollmentFee: number
      weeklyAccessDays: number | null
      benefits: string[]
      autoCharge: boolean
      at: string
    }
  | {
      /** Desafio do mês escolhido na demonstração. */
      t: 'chal'
      code: string
      cycle: string
      at: string
    }
  | {
      /** Progresso lançado num desafio. */
      t: 'chalprog'
      code: string
      cycle: string
      delta: number
    }
  | {
      /** Sino aberto: tudo criado antes deste instante conta como lido. */
      t: 'notifread'
      at: string
    }
  | {
      /**
       * Treino montado na demonstração.
       *
       * Os exercícios viajam em forma curta — id, séries, repetições, descanso
       * — porque o orçamento do cookie é de 4 KB e um treino com nome de
       * exercício por extenso comeria metade dele sozinho. O nome vem do
       * catálogo na leitura.
       */
      t: 'wplan'
      id: string
      name: string
      goal: string | null
      split: string
      ex: Array<[exerciseId: string, sets: number, reps: string, rest: number]>
      at: string
    }
  | {
      /** Treino atribuído a um aluno. */
      t: 'wassign'
      id: string
      planId: string
      studentId: string
      until: string | null
      at: string
    }
  | {
      /** Consentimento aceito ou revogado na demonstração. */
      t: 'consent'
      /** Tipo do consentimento; a versão é sempre a vigente. */
      code: string
      ok: boolean
      at: string
    }
  | {
      /** Registro de presença. */
      t: 'checkin'
      id: string
      studentId: string
      method: CheckIn['method']
      at: string
    }

/** Situação derivada de um aluno depois do diário. */
export type StudentOverride = { status?: StudentStatus }

const MAX_ENTRIES = 40
const MAX_BYTES = 3500
const MAX_AGE = 60 * 60 * 8

function encode(journal: DemoMutation[]): string {
  return Buffer.from(JSON.stringify(journal), 'utf8').toString('base64url')
}

function decode(raw: string): DemoMutation[] {
  const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))
  if (!Array.isArray(parsed)) return []
  // Entrada sem `t` conhecido é descartada: o cookie vem do cliente.
  return parsed.filter(
    (item): item is DemoMutation =>
      typeof item === 'object' &&
      item !== null &&
      ['student', 'plan', 'paid', 'checkin', 'notifread', 'chal', 'chalprog'].includes(
        (item as { t?: unknown }).t as string,
      ),
  )
}

/** Lê o diário do visitante. Cookie ausente ou corrompido devolve vazio. */
export async function readDemoJournal(): Promise<DemoMutation[]> {
  try {
    const raw = (await cookies()).get(DEMO_JOURNAL_COOKIE)?.value
    return raw ? decode(raw) : []
  } catch {
    // Cookie adulterado ou contexto sem acesso: a demonstração volta ao base.
    return []
  }
}

/**
 * Acrescenta uma alteração e regrava o cookie.
 *
 * Só funciona dentro de uma Server Action ou Route Handler — é onde o Next
 * permite escrever cookie. Durante render a escrita é ignorada de propósito,
 * porque render não deveria estar alterando dado nenhum.
 */
export async function appendDemoMutation(mutation: DemoMutation): Promise<void> {
  try {
    const store = await cookies()
    const current = await readDemoJournal()

    let next = [...current, mutation]
    if (next.length > MAX_ENTRIES) next = next.slice(next.length - MAX_ENTRIES)

    // Estoura o orçamento do cookie: descarta as alterações mais antigas.
    while (next.length > 1 && encode(next).length > MAX_BYTES) next = next.slice(1)

    store.set(DEMO_JOURNAL_COOKIE, encode(next), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: MAX_AGE,
    })
  } catch (error) {
    logger.warn('demo:journal_write_skipped', { reason: String(error).slice(0, 120) })
  }
}

/** Devolve a demonstração ao estado inicial. */
export async function clearDemoJournal(): Promise<void> {
  try {
    ;(await cookies()).delete(DEMO_JOURNAL_COOKIE)
  } catch (error) {
    logger.warn('demo:journal_clear_skipped', { reason: String(error).slice(0, 120) })
  }
}
