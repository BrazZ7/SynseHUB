import type { StudentExperience, StudentGoal, StudentIntake } from '@/types/domain'

/**
 * A entrada guiada: tipos, rótulos e a regra da porta.
 *
 * Fora do arquivo de actions porque ele é `'use server'` e só exporta função
 * assíncrona.
 */

export type EntradaActionState = { status: 'idle' | 'success' | 'error'; erro?: string }
export const estadoInicialDaEntrada: EntradaActionState = { status: 'idle' }

type Rotulo = { rotulo: string; ajuda: string }

/**
 * Os rótulos, num lugar só: a tela do aluno e a ficha do hub leem os mesmos.
 *
 * `Record` sobre a união, e não um array solto — a mesma defesa que
 * `TIPOS_ACEITOS` usa no diário da demonstração. Acrescentar um valor ao enum
 * do banco sem acrescentar o rótulo aqui **deixa de compilar**.
 *
 * Com array, a falta era silenciosa nos dois sentidos: um valor novo sem
 * rótulo vira `—` na ficha do professor, e um valor removido daqui continua
 * existindo no banco, na linha de quem já tinha escolhido.
 */
const ROTULOS_DO_OBJETIVO: Record<StudentGoal, Rotulo> = {
  EMAGRECER: { rotulo: 'Emagrecer', ajuda: 'Perder gordura, com treino e rotina' },
  GANHAR_MASSA: { rotulo: 'Ganhar massa', ajuda: 'Crescer músculo e força' },
  CONDICIONAMENTO: { rotulo: 'Condicionamento', ajuda: 'Fôlego, resistência, correr melhor' },
  SAUDE: { rotulo: 'Saúde e bem-estar', ajuda: 'Movimento, disposição, dormir melhor' },
}

const ROTULOS_DA_EXPERIENCIA: Record<StudentExperience, Rotulo> = {
  NUNCA_TREINEI: { rotulo: 'Nunca treinei', ajuda: 'Ou faz muito tempo que parei' },
  VOLTANDO: { rotulo: 'Estou voltando', ajuda: 'Já treinei antes e parei um tempo' },
  TREINO_SEMPRE: { rotulo: 'Treino sempre', ajuda: 'Tenho rotina e quero evoluir' },
}

/* A ordem é a de declaração acima, que é a ordem em que a tela pergunta. */
export const OBJETIVOS: ReadonlyArray<{ valor: StudentGoal } & Rotulo> = (
  Object.keys(ROTULOS_DO_OBJETIVO) as StudentGoal[]
).map((valor) => ({ valor, ...ROTULOS_DO_OBJETIVO[valor] }))

export const EXPERIENCIAS: ReadonlyArray<{ valor: StudentExperience } & Rotulo> = (
  Object.keys(ROTULOS_DA_EXPERIENCIA) as StudentExperience[]
).map((valor) => ({ valor, ...ROTULOS_DA_EXPERIENCIA[valor] }))

export const DIAS_POSSIVEIS = [1, 2, 3, 4, 5, 6, 7] as const

export function rotuloDoObjetivo(valor: StudentGoal | null): string | null {
  return valor ? (ROTULOS_DO_OBJETIVO[valor]?.rotulo ?? null) : null
}

export function rotuloDaExperiencia(valor: StudentExperience | null): string | null {
  return valor ? (ROTULOS_DA_EXPERIENCIA[valor]?.rotulo ?? null) : null
}

/**
 * A porta: o `/app` manda para a entrada guiada?
 *
 * Três estados, e a diferença entre os dois últimos é a razão de `skipped_at`
 * existir:
 *
 *   - `null` — nunca abriu a tela. **Manda.**
 *   - linha com `skippedAt` — já perguntei, a pessoa disse depois. Não manda,
 *     senão a boa-vinda vira obstáculo a cada abertura do app.
 *   - linha com `completedAt` — respondeu. Não manda.
 *
 * Função pura e separada da página de propósito: é a regra que decide se
 * **toda** abertura do app desvia, e um erro aqui prende a pessoa fora da tela
 * de hoje. Testar isso renderizando a página seria caro; testar isto é direto.
 */
export function precisaDaEntradaGuiada(intake: StudentIntake | null): boolean {
  if (!intake) return true
  return intake.completedAt === null && intake.skippedAt === null
}

/** Já respondeu as três? O banco garante que não existe metade. */
export function respondeu(intake: StudentIntake | null): boolean {
  return !!intake?.completedAt
}
