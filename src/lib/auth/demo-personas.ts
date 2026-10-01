import 'server-only'

import { getDemoDataset } from '@/lib/database/demo-seed'
import { PLUS_PRICE } from '@/lib/plans/tiers'
import { SEM_ASSINATURA, type PlusSubscription } from '@/lib/plans/subscription'
import type { UserRole } from '@/types/domain'

/**
 * ── As contas de demonstração, fora de `session.ts` ──────────────────────────
 *
 * Estavam no meio da sessão, e saíram daqui por uma necessidade concreta: o
 * data source precisa saber se quem está vendo assina o Synse+, para que a
 * demonstração mostre a vitrine do cadeado ao aluno do plano grátis em vez de
 * entregar o conteúdo pago a todo mundo.
 *
 * Quem monta o data source é `lib/database/index.ts`, e `session.ts` importa
 * esse módulo. Importar a sessão de volta fecharia um ciclo. Com as personas
 * num módulo só delas — que depende da semente e dos planos, de nada mais —
 * os dois lados leem daqui sem se enxergar.
 *
 * `session.ts` reexporta tudo, então nada que já importava de lá precisou
 * mudar.
 */

export const DEMO_SESSION_COOKIE = 'synse_demo_session'

// ── Personas de demonstração ────────────────────────────────────────────────
/**
 * Contas de demonstração.
 *
 * Não existe senha: em DEMO MODE a sessão é escolhida explicitamente e gravada
 * num cookie assinado pelo próprio host. Nenhuma credencial real é criada, e o
 * modo só é possível quando não há Supabase configurado.
 */
export type DemoPersona = {
  key: string
  label: string
  description: string
  role: UserRole
  userProfileId: string
  studentId?: string
}

export function getDemoPersonas(): DemoPersona[] {
  const demo = getDemoDataset()
  return [
    {
      key: 'owner',
      label: 'Emerson Braz',
      description: 'Proprietário — acesso completo à Academia Alpha',
      role: 'OWNER',
      userProfileId: 'prof_staff_0001',
    },
    {
      key: 'manager',
      label: 'Marina Duarte',
      description: 'Gerente — operação, alunos e financeiro',
      role: 'MANAGER',
      userProfileId: 'prof_staff_0002',
    },
    {
      key: 'trainer',
      label: 'Rafael Nunes',
      description: 'Professor — treinos, avaliações e alunos atribuídos',
      role: 'TRAINER',
      userProfileId: 'prof_staff_0003',
    },
    {
      key: 'receptionist',
      label: 'Lucas Ferraz',
      description: 'Recepção — check-in, matrículas e cobranças',
      role: 'RECEPTIONIST',
      userProfileId: 'prof_staff_0006',
    },
    {
      key: 'student',
      label: 'Aluno Synse App',
      description: 'Experiência do aluno — no teste grátis do Synse+',
      role: 'STUDENT',
      userProfileId: 'prof_0001',
      studentId: demo.studentIdForApp,
    },
    /*
     * A mesma tela, sem assinatura.
     *
     * Existe porque a persona acima entra em teste grátis, e com ela sozinha a
     * demonstração deixou de mostrar a **oferta** — "primeiro mês R$ 0,00,
     * depois o valor cheio" —, que é o que um aluno de verdade vê primeiro.
     * Uma tela invisível tinha sido trocada por outra.
     */
    {
      key: 'student-free',
      label: 'Aluno no plano grátis',
      description: 'Experiência do aluno — sem Synse+, vendo a oferta',
      role: 'STUDENT',
      userProfileId: 'prof_0002',
      studentId: demo.students[1]?.id ?? demo.studentIdForApp,
    },
    {
      key: 'super-admin',
      label: 'Synse Plataforma',
      description: 'Super admin — visão de todas as organizações',
      role: 'SUPER_ADMIN',
      userProfileId: 'prof_super_0001',
    },
  ]
}

export function findDemoPersona(key: string | undefined | null): DemoPersona | null {
  if (!key) return null
  return getDemoPersonas().find((persona) => persona.key === key) ?? null
}

/**
 * O teste grátis da demonstração.
 *
 * A persona de aluno entra **no meio** do primeiro ciclo, não no começo nem no
 * fim: é o estado em que a tela tem mais o que dizer — o Synse+ liberado, e um
 * aviso de quando a primeira cobrança acontece. Começar no dia 1 esconderia a
 * contagem; terminar no dia 30 mostraria a tela de expiração, que não é o que
 * quem está avaliando o produto precisa ver.
 *
 * Isto é um estado, não uma chave fixa: passa pelo mesmo `PlusSubscription`
 * que a conta real usa, então a demonstração exercita o caminho de verdade. A
 * alternativa — um `tier: 'PRO'` cravado — seria a quarta vez nesta sessão em
 * que a vitrine mostra algo que o produto não faz assim.
 */
const DIAS_JA_CORRIDOS_NA_DEMO = 12

export function assinaturaDaDemo(persona: DemoPersona, agora: Date): PlusSubscription {
  // Só a persona do teste. A do plano grátis existe justamente para mostrar a
  // tela de quem ainda não assinou.
  if (persona.key !== 'student') return SEM_ASSINATURA

  const fim = new Date(agora)
  fim.setDate(fim.getDate() + (PLUS_PRICE.trialDays - DIAS_JA_CORRIDOS_NA_DEMO))
  return { status: 'TRIAL', until: fim.toISOString() }
}

/** A assinatura da persona que está no cookie. Fora da demonstração, nenhuma. */
export function assinaturaDaPersonaNoCookie(chave: string | undefined | null): PlusSubscription {
  const persona = findDemoPersona(chave)
  return persona ? assinaturaDaDemo(persona, new Date()) : SEM_ASSINATURA
}

/** A persona que está no cookie é conta de plataforma? */
export function personaDoCookieEhPlataforma(chave: string | undefined | null): boolean {
  return findDemoPersona(chave)?.role === 'SUPER_ADMIN'
}
