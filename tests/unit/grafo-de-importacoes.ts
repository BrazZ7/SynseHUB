import { readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import fg from 'fast-glob'

/**
 * ── O que a tela alcança ────────────────────────────────────────────────────
 *
 * Duas perguntas diferentes dependem da mesma caminhada: "esta server action
 * tem porta?" (`action-sem-porta`) e "este método do data source tem
 * chamador?" (`metodo-sem-chamador`). As duas nasceram da mesma descoberta —
 * código correto, testado, revisado e **inalcançável** — e manter duas cópias
 * do caminhador faria uma delas enfraquecer sem ninguém notar.
 *
 * A pergunta não é "alguém cita?". A primeira versão do guarda das actions
 * perguntava isso e passou no caso que mais importava: desligar o componente
 * da página não derrubou nada, porque o componente — que já não renderizava —
 * continuava citando a action. O que vale é se a citação chega a uma rota.
 *
 * ── O limite, escrito ───────────────────────────────────────────────────────
 *
 * Isto caminha por `import`, não por renderização. Um arquivo importado e
 * nunca usado conta como alcançável. É um teto conhecido: pega o que ninguém
 * ligou, não pega o que alguém desligou pela metade.
 */

export const RAIZ = process.cwd()

/**
 * Tira comentários antes de contar.
 *
 * Mesma razão de `comparativo-honesto`: um arquivo de teste e o próprio
 * componente citam o nome em comentário, e um contador que lê comentário se
 * convence de que a porta existe porque alguém escreveu sobre ela.
 */
export function semComentarios(codigo: string): string {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .filter((linha) => !/^\s*(\/\/|\*)/.test(linha))
    .join('\n')
}

/**
 * Os arquivos que este `import` alcança, já resolvidos para caminho real.
 *
 * `existe` é o conjunto de arquivos conhecidos, e não o disco. A diferença
 * importa para os controles, que injetam arquivos de mentira para provar que o
 * detector ainda detecta — com `existsSync` eles nunca seriam resolvidos, e o
 * controle estaria testando a si mesmo.
 */
export function importados(
  arquivo: string,
  codigo: string,
  existe: (caminho: string) => boolean,
): string[] {
  const alvos: string[] = []

  for (const [, especificador] of codigo.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    let base: string
    if (especificador.startsWith('@/')) base = join(RAIZ, 'src', especificador.slice(2))
    else if (especificador.startsWith('.'))
      base = resolve(dirname(join(RAIZ, arquivo)), especificador)
    else continue // pacote de node_modules

    for (const sufixo of ['.ts', '.tsx', '/index.ts', '/index.tsx', '']) {
      const tentativa = relative(RAIZ, base + sufixo)
      if (sufixo === '' && !/\.tsx?$/.test(tentativa)) continue
      if (existe(tentativa)) {
        alvos.push(tentativa)
        break
      }
    }
  }

  return alvos
}

export type Grafo = {
  /** O código de cada arquivo, como está no disco. */
  bruto: Map<string, string>
  /** O mesmo código sem comentários — é nele que se conta citação. */
  limpo: Map<string, string>
  /** Os que pendem de alguma rota, descendo pelos `import` a partir de `src/app`. */
  alcancaveis: Set<string>
}

/**
 * Monta o grafo de `src`, opcionalmente com arquivos injetados.
 *
 * `extras` existe para os controles: arquivos só em memória, que provam que o
 * detector continua detectando quando a lista de dívida está vazia — sem eles,
 * `toEqual([])` passaria igual se o caminhador marcasse tudo como alcançável.
 */
export function montarGrafo(extras: Record<string, string> = {}): Grafo {
  const doDisco = fg.sync(['src/**/*.{ts,tsx}'], { cwd: RAIZ })
  const bruto = new Map(doDisco.map((a) => [a, readFileSync(join(RAIZ, a), 'utf8')]))
  for (const [caminho, conteudo] of Object.entries(extras)) bruto.set(caminho, conteudo)

  const arquivos = [...bruto.keys()]
  const conhecidos = new Set(arquivos)
  const existe = (caminho: string) => conhecidos.has(caminho)
  const limpo = new Map([...bruto].map(([a, c]) => [a, semComentarios(c)]))

  /*
   * Raiz é tudo em `src/app`: página, layout, rota de API, `middleware`. De lá
   * a busca desce pelos `import`, e só o que ela visita conta como alcançável
   * a partir de uma tela.
   */
  const alcancaveis = new Set<string>()
  const fila = arquivos.filter((a) => a.startsWith('src/app/') || a === 'src/middleware.ts')

  while (fila.length > 0) {
    const atual = fila.pop() as string
    if (alcancaveis.has(atual)) continue
    alcancaveis.add(atual)
    for (const vizinho of importados(atual, limpo.get(atual) ?? '', existe)) {
      if (!alcancaveis.has(vizinho)) fila.push(vizinho)
    }
  }

  return { bruto, limpo, alcancaveis }
}

/** Algum arquivo alcançável, fora dos `excluidos`, cita este nome? */
export function citadoPorTelaViva(
  grafo: Grafo,
  nome: string,
  excluidos: (arquivo: string) => boolean,
): boolean {
  const citacao = new RegExp(`\\b${nome}\\b`)
  for (const [arquivo, codigo] of grafo.limpo) {
    if (excluidos(arquivo)) continue
    if (!grafo.alcancaveis.has(arquivo)) continue
    if (citacao.test(codigo)) return true
  }
  return false
}
