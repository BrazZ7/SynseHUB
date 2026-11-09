import { duracao } from '@/features/students/numeros'
import { diaLocal } from '@/features/students/streak'
import type { WeekSummary } from '@/types/domain'

/**
 * ── A semana, sem servidor ──────────────────────────────────────────────────
 *
 * Em produção quem agrupa por semana é o banco (`student_week_summary`, 0066),
 * e é lá que a conta tem de estar: a semana civil depende do fuso da academia,
 * e em UTC o treino de domingo à noite muda de semana.
 *
 * Este arquivo existe por dois motivos, e nenhum deles é duplicar aquela conta
 * por preguiça:
 *
 *  1. **A demonstração não tem banco.** Ela deriva tudo da semente e do
 *     diário, a cada leitura. Sem este agrupamento o resumo semanal seria a
 *     única tela do produto que não funciona no modo demonstração.
 *  2. **A leitura dos números é da tela.** "Treinou mais que na semana
 *     passada", "faltam dois dias para a meta", "a meta é a declarada ou a
 *     padrão" — isso é regra de apresentação, e regra de apresentação testada
 *     em função pura é mais barata que testada por navegador.
 *
 * O item 1 é a duplicação real, e ela tem teste próprio: o mesmo conjunto de
 * eventos passa pelo SQL e por aqui, e as duas contas têm de dar igual. Se
 * divergirem, o teste cai antes de a tela mentir.
 */

/** Meta de dias por semana de quem não respondeu a entrada guiada. */
export const META_PADRAO = 5

/** O dia da semana de uma data civil, ancorado ao meio-dia — como em `streak`. */
function diaDaSemana(dia: string): number {
  return new Date(`${dia}T12:00:00Z`).getUTCDay()
}

/**
 * A segunda-feira da semana em que o instante cai, no fuso dado.
 *
 * Segunda, e não domingo: é a semana que o Postgres usa (`date_trunc('week')`)
 * e a que a academia usa — quem treina sábado e domingo fecha o ciclo, não
 * começa outro. As duas pontas precisam concordar, senão o resumo da
 * demonstração cai numa semana e o de produção na outra.
 */
export function inicioDaSemanaLocal(instante: Date | string, fuso: string): string {
  const data = instante instanceof Date ? instante : new Date(instante)
  const dia = diaLocal(data, fuso)
  // Domingo é 0; na semana que começa na segunda, ele é o sétimo dia.
  const passos = (diaDaSemana(dia) + 6) % 7
  const cursor = new Date(`${dia}T12:00:00Z`)
  cursor.setUTCDate(cursor.getUTCDate() - passos)
  return cursor.toISOString().slice(0, 10)
}

/** As `quantas` semanas que terminam na atual, mais recente primeiro. */
export function semanasRecentes(agora: Date, fuso: string, quantas: number): string[] {
  const atual = inicioDaSemanaLocal(agora, fuso)
  const semanas: string[] = []
  for (let i = 0; i < Math.max(1, Math.floor(quantas)); i += 1) {
    const cursor = new Date(`${atual}T12:00:00Z`)
    cursor.setUTCDate(cursor.getUTCDate() - 7 * i)
    semanas.push(cursor.toISOString().slice(0, 10))
  }
  return semanas
}

/**
 * A meta da semana, e de onde ela veio.
 *
 * A home dizia "X de 5" com o 5 cravado em `app-service.ts`. Desde a 0063 o
 * aluno declara quantos dias quer treinar — e quem declarou três e treinou
 * três via 60% e um anel pela metade. A tela chamava de fracasso a semana que
 * a pessoa cumpriu.
 *
 * `declarada: false` não é detalhe de implementação: é o que deixa a tela
 * dizer "padrão" em vez de fingir que a pessoa escolheu cinco.
 */
export function metaDaSemana(targetDays: number | null | undefined): {
  dias: number
  declarada: boolean
} {
  return targetDays != null && targetDays > 0
    ? { dias: targetDays, declarada: true }
    : { dias: META_PADRAO, declarada: false }
}

/** Quanto da meta a semana cumpriu, de 0 a 100. */
export function percentualDaMeta(diasTreinados: number, meta: number): number {
  if (meta <= 0) return 0
  return Math.min(100, Math.round((diasTreinados / meta) * 100))
}

export type Comparacao = {
  /** A diferença com sinal, para a tela escolher a seta. */
  delta: number
  /** `null` quando não há com o que comparar — e isso não é "igual". */
  direcao: 'subiu' | 'caiu' | 'igual' | null
}

/**
 * Compara um número desta semana com o da anterior.
 *
 * `null` em qualquer das pontas devolve `direcao: null`, e não "igual": quem
 * não se pesou na semana passada não manteve o peso, só não se pesou. Tratar
 * ausência como igualdade é como um resumo passa a afirmar o que não sabe.
 */
export function comparar(
  agora: number | null | undefined,
  antes: number | null | undefined,
): Comparacao {
  if (agora == null || antes == null) return { delta: 0, direcao: null }
  const delta = agora - antes
  /*
   * `Math.abs(delta) < 1e-9` e não `delta === 0`: estes números vêm de
   * `numeric` do Postgres e de somas de ponto flutuante. Peso de 80.1 contra
   * 80.1 pode sair com resto na décima sexta casa, e aí a tela desenharia uma
   * seta de subida para quem não mudou nada.
   */
  if (Math.abs(delta) < 1e-9) return { delta: 0, direcao: 'igual' }
  return { delta, direcao: delta > 0 ? 'subiu' : 'caiu' }
}

/**
 * A frase que abre o resumo.
 *
 * Uma frase e não um número: o resumo existe para alguém que abriu o app no
 * domingo à noite querendo saber se a semana valeu. Os números estão nos
 * cartões; esta linha diz o que eles significam.
 *
 * Ela nunca repreende. "Faltou" e "você falhou" afastam exatamente quem o
 * resumo precisa alcançar — e a semana ainda não acabou quando a pessoa abre
 * na quarta.
 */
export function frase(semana: Pick<WeekSummary, 'daysTrained' | 'targetDays'>): string {
  const meta = metaDaSemana(semana.targetDays)
  const falta = meta.dias - semana.daysTrained

  if (semana.daysTrained === 0) return 'A semana está começando.'
  if (falta <= 0) return 'Meta da semana cumprida.'
  if (falta === 1) return 'Falta um dia para fechar a semana.'
  return `Faltam ${falta} dias para fechar a semana.`
}

/**
 * O tempo em movimento da semana, treino e corrida somados.
 *
 * Juntos aqui, separados nos cartões: a soma responde "quanto me movi" e os
 * cartões respondem "em quê". Na soma a divisão entre matrícula e pessoa não
 * importa, porque o tempo é da pessoa nos dois casos.
 *
 * `duracao` vem do módulo compartilhado com o histórico: é lá que mora a regra
 * de não escrever "0 min" para o que durou vinte segundos.
 */
export function tempoEmMovimento(
  semana: Pick<WeekSummary, 'workoutSeconds' | 'runSeconds'>,
): string | null {
  return duracao((semana.workoutSeconds ?? 0) + (semana.runSeconds ?? 0))
}
