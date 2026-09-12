/**
 * O schema ainda não tem o que este código pede?
 *
 * Publicar e migrar são dois atos, feitos por mãos diferentes e em momentos
 * diferentes: a Vercel publica sozinha no push, o SQL é colado à mão no painel
 * do Supabase. Entre um e outro existe uma janela em que o código novo fala
 * com o banco velho — e nessa janela o app precisa continuar de pé.
 *
 * Foi o que faltou quando `getSession` passou a ler `user_profiles.tier`: a
 * consulta inteira falhava, a sessão virava nula e quem entrava era mandado
 * de volta para o cadastro. Login "sem responder", sem nada no log.
 *
 * Os códigos abaixo são os quatro jeitos de o Postgres e o PostgREST dizerem
 * "isso ainda não existe aqui".
 */
const CODIGOS = new Set([
  '42P01', // undefined_table
  '42703', // undefined_column
  'PGRST202', // função não encontrada no schema exposto
  'PGRST205', // tabela não encontrada no schema exposto
])

export function isPendingMigration(error: unknown, profundidade = 0): boolean {
  if (!error || profundidade > 3) return false

  const alvo = error as { code?: unknown; message?: unknown; cause?: unknown }
  if (typeof alvo.code === 'string' && CODIGOS.has(alvo.code)) return true

  const texto = String(alvo.message ?? error)
  if (
    /does not exist/i.test(texto) ||
    /não existe/i.test(texto) ||
    /could not find .* in the schema cache/i.test(texto)
  ) {
    return true
  }

  // O data source embrulha o erro do PostgREST e guarda o original em `cause`.
  return isPendingMigration(alvo.cause, profundidade + 1)
}
