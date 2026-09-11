/**
 * Validação de CPF pelos dígitos verificadores.
 *
 * O provedor de pagamento recusa cobrança com documento inválido, e a recusa
 * chega depois — na hora de emitir, com a mensalidade já cadastrada e o aluno
 * esperando. Barrar na entrada é o que evita um cadastro que parece completo e
 * não consegue cobrar.
 *
 * Também é o que cumpre a regra de nunca importar registro inválido: a mesma
 * função vale para o formulário e para o CSV.
 */

/** Só os dígitos. Aceita com ou sem máscara. */
export function normalizeTaxId(value: string): string {
  return value.replace(/\D/g, '')
}

/**
 * Dígito verificador do CPF: soma ponderada, módulo 11, resto abaixo de 2 vira
 * zero. Calculado duas vezes, uma para cada dígito.
 */
function digitoVerificador(base: string, pesoInicial: number): number {
  let soma = 0
  for (let i = 0; i < base.length; i += 1) soma += Number(base[i]) * (pesoInicial - i)
  const resto = (soma * 10) % 11
  return resto >= 10 ? 0 : resto
}

export function isValidCpf(value: string): boolean {
  const cpf = normalizeTaxId(value)
  if (cpf.length !== 11) return false

  /*
   * 111.111.111-11 e os outros dez repetidos passam na conta dos dígitos
   * verificadores, mas não são CPFs. É o erro de digitação mais comum e o
   * preenchimento de teste mais comum — recusar explicitamente.
   */
  if (/^(\d)\1{10}$/.test(cpf)) return false

  return (
    digitoVerificador(cpf.slice(0, 9), 10) === Number(cpf[9]) &&
    digitoVerificador(cpf.slice(0, 10), 11) === Number(cpf[10])
  )
}

/** Formatação de leitura: 000.000.000-00. */
export function formatCpf(value: string | null | undefined): string {
  const cpf = normalizeTaxId(value ?? '')
  if (cpf.length !== 11) return value ?? ''
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`
}
