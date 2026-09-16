/**
 * Erros de aplicação com mensagem *humana* para o usuário e detalhe técnico
 * preservado para o log do servidor. Nunca vazar stack ou SQL para a UI.
 */
export class AppError extends Error {
  readonly code: string
  readonly status: number
  readonly userMessage: string

  constructor(code: string, userMessage: string, status = 400, technicalMessage?: string) {
    super(technicalMessage ?? userMessage)
    this.name = 'AppError'
    this.code = code
    this.status = status
    this.userMessage = userMessage
  }
}

export const unauthorized = () =>
  new AppError('unauthorized', 'Sua sessão expirou. Entre novamente para continuar.', 401)

export const forbidden = (detail?: string) =>
  new AppError(
    'forbidden',
    'Você não tem permissão para acessar esta área.',
    403,
    detail ? `missing: ${detail}` : undefined,
  )

export const notFound = (entity = 'registro') =>
  new AppError('not_found', `Não encontramos este ${entity}.`, 404)

export const invalidInput = (detail?: string) =>
  new AppError('invalid_input', 'Revise os campos destacados e tente novamente.', 422, detail)

export const conflict = (userMessage: string, detail?: string) =>
  new AppError('conflict', userMessage, 409, detail)

/**
 * `detail` entra na `message` do erro, que só existe no servidor — a UI lê
 * `userMessage`. Serve para dizer qual chamada falhou e com que código, sem
 * carregar o corpo da resposta: o do Asaas traz CPF e nome do pagador.
 */
export const providerUnavailable = (provider: string, detail?: string) =>
  new AppError(
    'provider_unavailable',
    'O provedor de pagamentos não respondeu. Tente novamente em instantes.',
    502,
    detail ? `provider: ${provider} — ${detail}` : `provider: ${provider}`,
  )

/**
 * O provedor respondeu — e recusou.
 *
 * Diferente de `providerUnavailable`, que é "não deu para falar com ele".
 * Tratar recusa como indisponibilidade manda a pessoa tentar de novo para
 * sempre, quando o que falta é corrigir um dado. A mensagem aqui carrega o que
 * o provedor apontou, então só é usada onde o dado recusado pertence a quem
 * está olhando a tela.
 */
export const providerRejected = (userMessage: string, detail?: string) =>
  new AppError('provider_rejected', userMessage, 422, detail)

/** Converte qualquer erro em uma mensagem segura de exibir. */
export function toUserMessage(error: unknown): string {
  if (error instanceof AppError) return error.userMessage
  return 'Não foi possível concluir esta operação. Tente novamente.'
}
