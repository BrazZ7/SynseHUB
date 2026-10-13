/**
 * ── O que a pessoa lê quando a inscrição é recusada ─────────────────────────
 *
 * `toUserMessage` só conhece `AppError`; qualquer outra coisa vira "Não foi
 * possível concluir esta operação. Tente novamente." Para a inscrição pública
 * isso é o pior texto possível: quem tenta com o CPF já inscrito lê um convite
 * a tentar de novo, e tenta — para sempre.
 *
 * As recusas de `inscrever_no_evento` são, quase todas, mensagens escritas
 * para serem lidas: "As inscrições já encerraram.", "Categoria não é deste
 * evento.". Elas só precisam chegar à tela.
 *
 * ── O que é repassado, e o que é reescrito ─────────────────────────────────
 *
 * Repassado: o que a função levanta de propósito, pelos códigos `22023`
 * (argumento recusado) e `P0002` (não encontrado). São frases minhas, na
 * migration, feitas para esta tela.
 *
 * Reescrito: a violação de unicidade (`23505`). A mensagem nativa do Postgres
 * é "duplicate key value violates unique constraint
 * event_registrations_sem_repeticao_idx" — nome de índice não é recado para
 * quem está tentando correr dez quilômetros.
 *
 * Qualquer outro erro devolve `null`, e o genérico assume. Um defeito de rede
 * ou de permissão não deve virar frase tranquilizadora sobre inscrição.
 */

/** Tamanho máximo de mensagem repassada. Acima disso é despejo, não recado. */
const LIMITE = 200

const REPASSAVEIS = new Set(['22023', 'P0002'])

function codigoDoErro(error: unknown, profundidade = 0): string | null {
  if (!error || profundidade > 3) return null
  const alvo = error as { code?: unknown; cause?: unknown }
  if (typeof alvo.code === 'string') return alvo.code
  return codigoDoErro(alvo.cause, profundidade + 1)
}

function mensagemDoErro(error: unknown, profundidade = 0): string | null {
  if (!error || profundidade > 3) return null
  const alvo = error as { message?: unknown; cause?: unknown }
  if (typeof alvo.message === 'string' && alvo.message.trim()) {
    const texto = alvo.message.trim()
    // O embrulho do data source não é mensagem: ele só carrega a `cause`.
    if (!texto.startsWith('supabase query failed')) return texto
  }
  return mensagemDoErro(alvo.cause, profundidade + 1)
}

export function mensagemDaInscricao(error: unknown): string | null {
  const codigo = codigoDoErro(error)

  if (codigo === '23505') {
    return 'Este CPF já tem inscrição neste evento. Se foi você, procure o e-mail com o seu código.'
  }

  if (codigo && REPASSAVEIS.has(codigo)) {
    const mensagem = mensagemDoErro(error)
    if (mensagem && mensagem.length <= LIMITE) return mensagem
  }

  return null
}
