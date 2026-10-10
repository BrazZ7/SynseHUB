import 'server-only'

/**
 * Os últimos erros de servidor, na memória do processo.
 *
 * Existe por uma limitação concreta desta operação: o log fica na Vercel, e
 * quem opera o produto trabalha pelo navegador — sem terminal e sem acesso ao
 * painel de logs. Sem isto, "deu erro na tela" chega como uma referência de
 * oito dígitos que ninguém consegue trocar por uma causa, e o diagnóstico vira
 * troca de mensagens às cegas.
 *
 * Cada registro é marcado com o `sub` do JWT de quem fez a requisição, e a
 * leitura só devolve os do próprio leitor: um erro pode carregar dado de quem
 * o provocou, e ninguém precisa ver o do vizinho para depurar o próprio.
 *
 * A memória sozinha não bastou: em serverless, a requisição que lê pode cair
 * numa instância diferente da que registrou, e o erro parece nunca ter
 * existido. Foi o que aconteceu duas vezes seguidas.
 *
 * Por isso cada erro também é gravado em `audit_logs`, que é o mesmo para
 * todas as instâncias. A memória continua como caminho rápido; o banco é o que
 * sobrevive ao salto de instância.
 */
export type RecentError = {
  at: string
  path: string
  digest: string | null
  message: string
  frames: string[]
  /** Sujeito do JWT de quem fez a requisição, quando havia sessão. */
  sub: string | null
}

const LIMITE = 20

/*
 * `Symbol.for` porque o bundler do Next pode avaliar este módulo mais de uma
 * vez — o gatilho de instrumentação e a rota que lê vivem em bundles
 * diferentes, e cada cópia teria a própria lista. Foi o mesmo motivo que levou
 * o dataset de demonstração para o registro global de símbolos.
 */
const CHAVE = Symbol.for('synse.recent.errors')
type GlobalComLista = typeof globalThis & { [CHAVE]?: RecentError[] }

function lista(): RecentError[] {
  const alvo = globalThis as GlobalComLista
  alvo[CHAVE] ??= []
  return alvo[CHAVE]
}

export function recordError(entrada: RecentError): void {
  const atual = lista()
  atual.push(entrada)
  if (atual.length > LIMITE) atual.splice(0, atual.length - LIMITE)

  void persistError(entrada)
}

/**
 * Grava em `audit_logs` — a única tabela do schema feita para registrar o que
 * aconteceu, e que já existe desde a 0003.
 *
 * Escreve com o cliente de serviço porque a política da tabela recusa qualquer
 * escrita vinda do cliente, de propósito: auditoria que o cliente escreve não
 * é auditoria. E falha em silêncio — se o banco for justamente o que quebrou,
 * insistir aqui só troca um erro por outro.
 */
async function persistError(entrada: RecentError): Promise<void> {
  try {
    const { createSupabaseAdminClient } = await import('@/lib/database/supabase-admin')
    const admin = createSupabaseAdminClient()
    if (!admin) return

    await admin.from('audit_logs').insert({
      action: 'server_error',
      entity: 'request',
      metadata: {
        path: entrada.path,
        digest: entrada.digest,
        message: entrada.message,
        frames: entrada.frames,
        sub: entrada.sub,
        at: entrada.at,
      },
    })
  } catch {
    // Diagnóstico que derruba o que está diagnosticando não serve.
  }
}

/**
 * Erros gravados no banco, que sobrevivem ao salto de instância.
 *
 * A leitura usa o cliente de serviço, que ignora RLS — então o filtro por dono
 * é feito aqui, explicitamente, e não pode ser esquecido: sem `sub`, devolve
 * lista vazia. Mensagem de erro carrega o que a requisição estava fazendo, e
 * isso continua sendo de quem a fez, esteja na memória ou no banco.
 *
 * `semDono` conta os registros que ficaram sem atribuição. É o número que
 * denuncia falha na leitura do cookie — sem entregar o conteúdo de ninguém.
 */
export async function readPersistedErrors(
  sub: string | null,
  limite = 10,
): Promise<{ meus: RecentError[]; semDono: number }> {
  try {
    const { createSupabaseAdminClient } = await import('@/lib/database/supabase-admin')
    const admin = createSupabaseAdminClient()
    if (!admin) return { meus: [], semDono: 0 }

    const { data } = await admin
      .from('audit_logs')
      .select('metadata, created_at')
      .eq('action', 'server_error')
      .order('created_at', { ascending: false })
      .limit(50)

    const linhas = (data ?? []).map((linha) => {
      const meta = (linha.metadata ?? {}) as Partial<RecentError>
      return {
        at: meta.at ?? (linha.created_at as string),
        path: meta.path ?? '?',
        digest: meta.digest ?? null,
        message: meta.message ?? '',
        frames: meta.frames ?? [],
        sub: meta.sub ?? null,
      }
    })

    return {
      meus: sub ? linhas.filter((item) => item.sub === sub).slice(0, limite) : [],
      semDono: linhas.filter((item) => item.sub === null).length,
    }
  } catch {
    return { meus: [], semDono: 0 }
  }
}

export function readErrorsFor(sub: string | null): { meus: RecentError[]; deOutros: number } {
  const atual = lista()
  const meus = sub ? atual.filter((item) => item.sub === sub) : []
  return { meus: [...meus].reverse(), deOutros: atual.length - meus.length }
}
