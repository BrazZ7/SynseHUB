/**
 * Tradução do formulário de plano para o que o schema espera.
 *
 * Fica separada da action por dois motivos: um arquivo `'use server'` só pode
 * exportar função assíncrona, e as três decisões abaixo — caixa desmarcada,
 * acesso livre e benefícios em linhas — são exatamente o tipo de coisa que
 * quebra em silêncio e merece teste próprio.
 */
export type PlanFormEntries = Record<string, string | undefined>

/**
 * Um benefício por linha.
 *
 * É como a pessoa já escreve quando anota os planos num caderno. Linha vazia
 * entre um e outro é hábito de digitação, não conteúdo — some aqui, em vez de
 * virar um item em branco no cartão do plano.
 */
export function parseBeneficios(valor: string | undefined): string[] {
  return String(valor ?? '')
    .split('\n')
    .map((linha) => linha.trim())
    .filter(Boolean)
    .slice(0, 12)
}

export function parsePlanForm(entries: PlanFormEntries) {
  /*
   * Caixa de seleção desmarcada não é enviada pelo navegador: a ausência é a
   * resposta "não". Ler com `=== 'on'` acerta os dois casos; ler `Boolean(...)`
   * transformaria a string "false" em verdadeiro.
   */
  const acessoLivre = entries.unlimitedAccess === 'on'

  return {
    name: entries.name,
    description: entries.description ?? '',
    price: entries.price,
    billingCycle: entries.billingCycle,
    enrollmentFee: entries.enrollmentFee || 0,
    /*
     * Acesso livre não tem número de dias. Mandar zero diria "nenhum dia por
     * semana", que é o oposto — e o banco guardaria um plano que ninguém pode
     * usar.
     */
    weeklyAccessDays: acessoLivre ? undefined : entries.weeklyAccessDays || undefined,
    benefits: parseBeneficios(entries.benefits),
    autoCharge: entries.autoCharge === 'on',
  }
}
