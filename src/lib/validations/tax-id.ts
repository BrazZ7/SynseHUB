/**
 * Validação de CPF e CNPJ pelos dígitos verificadores.
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

/**
 * Dígito verificador do CNPJ.
 *
 * Mesma ideia do CPF — soma ponderada e módulo 11 —, mas os pesos vão de 2 a 9
 * e reiniciam depois do nono dígito, em vez de decrescerem direto.
 */
function digitoCnpj(base: string): number {
  const pesos = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2].slice(-base.length)
  const soma = base.split('').reduce((total, d, i) => total + Number(d) * pesos[i], 0)
  const resto = soma % 11
  return resto < 2 ? 0 : 11 - resto
}

export function isValidCnpj(value: string): boolean {
  const cnpj = normalizeTaxId(value)
  if (cnpj.length !== 14) return false
  if (/^(\d)\1{13}$/.test(cnpj)) return false

  return (
    digitoCnpj(cnpj.slice(0, 12)) === Number(cnpj[12]) &&
    digitoCnpj(cnpj.slice(0, 13)) === Number(cnpj[13])
  )
}

/**
 * Documento da academia: CNPJ, ou CPF quando a pessoa atua como autônoma.
 *
 * O provedor aceita os dois na abertura de subconta, e recusar CPF deixaria de
 * fora o personal e o estúdio que ainda não abriu empresa — que é boa parte de
 * quem começa.
 */
export function isValidTaxId(value: string): boolean {
  const documento = normalizeTaxId(value)
  if (documento.length === 11) return isValidCpf(documento)
  if (documento.length === 14) return isValidCnpj(documento)
  return false
}

/** Formatação de leitura, escolhendo a máscara pelo tamanho. */
export function formatTaxId(value: string | null | undefined): string {
  const documento = normalizeTaxId(value ?? '')
  if (documento.length === 11) return formatCpf(documento)
  if (documento.length !== 14) return value ?? ''
  return `${documento.slice(0, 2)}.${documento.slice(2, 5)}.${documento.slice(5, 8)}/${documento.slice(8, 12)}-${documento.slice(12)}`
}
