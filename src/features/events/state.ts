/**
 * ── Constantes e regras puras dos eventos ───────────────────────────────────
 *
 * Fora das actions porque arquivo `'use server'` só exporta função assíncrona
 * — `tests/unit/use-server-exports.test.ts` guarda a regra — e porque o que
 * mora aqui precisa ser exercitado caso a caso, sem subir banco nem tela.
 */

/** Os tamanhos que o kit tem. A coluna do banco repete esta lista num `check`. */
export const TAMANHOS = ['PP', 'P', 'M', 'G', 'GG', 'XGG'] as const
export type TamanhoDeCamiseta = (typeof TAMANHOS)[number]

export type SituacaoDaInscricao = 'WAITLIST' | 'PENDING_PAYMENT' | 'CONFIRMED' | 'CANCELLED'

/**
 * O que cada situação quer dizer para quem se inscreveu.
 *
 * Em português de gente, e não o nome da coluna: "PENDING_PAYMENT" na tela é
 * o tipo de coisa que faz alguém achar que deu erro.
 */
export const ROTULO_DA_SITUACAO: Record<SituacaoDaInscricao, string> = {
  WAITLIST: 'Na fila de espera',
  PENDING_PAYMENT: 'Aguardando pagamento',
  CONFIRMED: 'Inscrição confirmada',
  CANCELLED: 'Inscrição cancelada',
}

export type InscricaoFormState = {
  status: 'idle' | 'success' | 'error'
  message?: string
  fieldErrors?: Record<string, string[]>
  /** Para onde mandar quem acabou de se inscrever. */
  codigo?: string
}

export const initialInscricaoState: InscricaoFormState = { status: 'idle' }

/** Só os dígitos. "123.456.789-09" e "12345678909" são o mesmo CPF. */
export function apenasDigitos(valor: string): string {
  return valor.replace(/\D/g, '')
}

/**
 * ── O CPF é conferido pelos dígitos verificadores ───────────────────────────
 *
 * O banco exige onze dígitos, e onze dígitos não é CPF: `00000000000` passa,
 * e `12345678900` também. Num evento pago isso não é detalhe — o CPF é o que
 * impede a mesma pessoa de pegar duas vagas e o que identifica quem pagou
 * quando o PIX cai com outro nome.
 *
 * A conta é a oficial: cada dígito verificador é o resto da soma ponderada
 * por onze, e resto menor que dois vira zero.
 *
 * Sequência repetida é recusada à parte. `111.111.111-11` fecha a conta dos
 * dois dígitos e não existe como CPF — é o caso que todo validador ingênuo
 * deixa passar.
 */
export function cpfValido(valor: string): boolean {
  const cpf = apenasDigitos(valor)
  if (cpf.length !== 11) return false
  if (/^(\d)\1{10}$/.test(cpf)) return false

  const digito = (ate: number): number => {
    let soma = 0
    for (let i = 0; i < ate; i += 1) soma += Number(cpf[i]) * (ate + 1 - i)
    const resto = (soma * 10) % 11
    return resto >= 10 ? 0 : resto
  }

  return digito(9) === Number(cpf[9]) && digito(10) === Number(cpf[10])
}

/** `12345678909` → `123.456.789-09`. Só para mostrar; o que viaja é o dígito. */
export function formatarCpf(valor: string): string {
  const cpf = apenasDigitos(valor).slice(0, 11)
  return cpf
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2')
}

/**
 * Telefone brasileiro: dez ou onze dígitos, com DDD.
 *
 * Não valida operadora nem nono dígito por região — recusar um telefone bom
 * é pior que aceitar um ruim, porque quem é recusado desiste da inscrição e
 * quem digitou errado a academia alcança pelo e-mail.
 */
export function telefoneValido(valor: string): boolean {
  const n = apenasDigitos(valor).length
  return n === 10 || n === 11
}

/** E-mail: o suficiente para pegar erro de digitação, sem inventar regra. */
export function emailValido(valor: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valor.trim())
}

/**
 * A janela de inscrição está aberta?
 *
 * Fora daqui a tela mostra o motivo — "ainda não abriu" e "já encerrou" são
 * duas frases diferentes, e dizer a errada faz a pessoa voltar no dia errado.
 */
export type JanelaDeInscricao =
  | { aberta: true }
  | { aberta: false; motivo: 'NAO_PUBLICADO' | 'AINDA_NAO_ABRIU' | 'ENCERRADA' | 'LOTADO_SEM_FILA' }

export function janelaDeInscricao(
  evento: {
    status: string
    registrationOpensAt: string | null
    registrationClosesAt: string | null
  },
  agora: Date,
): JanelaDeInscricao {
  if (evento.status !== 'PUBLISHED') return { aberta: false, motivo: 'NAO_PUBLICADO' }
  if (evento.registrationOpensAt && agora < new Date(evento.registrationOpensAt)) {
    return { aberta: false, motivo: 'AINDA_NAO_ABRIU' }
  }
  if (evento.registrationClosesAt && agora >= new Date(evento.registrationClosesAt)) {
    return { aberta: false, motivo: 'ENCERRADA' }
  }
  return { aberta: true }
}

/** Quantas vagas sobraram, ou `null` quando o evento não tem teto. */
export function vagasRestantes(capacity: number | null, ocupadas: number): number | null {
  if (capacity === null) return null
  return Math.max(0, capacity - ocupadas)
}
