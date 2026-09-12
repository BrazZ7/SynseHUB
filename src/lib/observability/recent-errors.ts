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
 * Memória de processo, de propósito: some no reinício e não viaja entre as
 * instâncias serverless. É janela de diagnóstico, não histórico — histórico é
 * papel do serviço de observabilidade, quando houver um.
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
}

export function readErrorsFor(sub: string | null): { meus: RecentError[]; deOutros: number } {
  const atual = lista()
  const meus = sub ? atual.filter((item) => item.sub === sub) : []
  return { meus: [...meus].reverse(), deOutros: atual.length - meus.length }
}
