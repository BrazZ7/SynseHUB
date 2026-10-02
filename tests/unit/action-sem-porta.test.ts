import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import fg from 'fast-glob'
import { describe, expect, it } from 'vitest'

/**
 * ── Server action que nenhuma tela alcança ──────────────────────────────────
 *
 * `apagarProgramaAction` foi escrita na 0043, passou nos testes, foi revisada
 * — e ficou cinco commits sem nenhuma tela que a chamasse. Escrita correta e
 * inalcançável: o defeito não estava no código dela, estava na ausência de
 * porta.
 *
 * É um defeito que nenhum teste de comportamento pega, porque o comportamento
 * está certo. Só aparece clicando pela tela e sentindo falta — ou contando.
 *
 * ── A primeira versão deste guarda era fraca ────────────────────────────────
 *
 * Ela perguntava "algum arquivo cita esta action?". Conferida por mutação,
 * passou no caso que mais importava: desliguei `<ApagarPrograma />` da página
 * e o teste continuou verde, porque o **componente** ainda citava a action —
 * um componente que nada renderizava. A pergunta certa não é se alguém cita,
 * é se a citação chega a uma tela.
 *
 * Agora o guarda caminha o grafo de importações a partir de `src/app` e só
 * considera alcançável a action citada por um arquivo que de fato pendura
 * numa rota.
 *
 * ── Por que a lista de dívida, e não zero ───────────────────────────────────
 *
 * Ao contar, apareceram mais seis. Estão nomeadas abaixo porque apagar um
 * teste que falha é fácil, e deixá-lo falhando até alguém consertar é
 * ignorá-lo. Registrada, a dívida fica visível, cada remoção dela é uma linha
 * a menos, e **qualquer action nova sem porta derruba a suíte na hora**.
 *
 * Sair daqui é tirar o nome da lista, não acrescentar outro.
 */

const RAIZ = process.cwd()

/**
 * Tira comentários antes de contar.
 *
 * Mesma razão de `comparativo-honesto`: este arquivo e o próprio
 * `apagar-programa.tsx` citam `apagarProgramaAction` em comentário, e um
 * contador que lê comentário se convence de que a porta existe porque alguém
 * escreveu sobre ela.
 */
function semComentarios(codigo: string): string {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .filter((linha) => !/^\s*(\/\/|\*)/.test(linha))
    .join('\n')
}

/** Os arquivos que este `import` alcança, já resolvidos para caminho real. */
function importados(arquivo: string, codigo: string): string[] {
  const alvos: string[] = []

  for (const [, especificador] of codigo.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    let base: string
    if (especificador.startsWith('@/')) base = join(RAIZ, 'src', especificador.slice(2))
    else if (especificador.startsWith('.'))
      base = resolve(dirname(join(RAIZ, arquivo)), especificador)
    else continue // pacote de node_modules

    for (const sufixo of ['.ts', '.tsx', '/index.ts', '/index.tsx', '']) {
      const tentativa = base + sufixo
      if (sufixo === '' && !/\.tsx?$/.test(tentativa)) continue
      if (existsSync(tentativa)) {
        alvos.push(relative(RAIZ, tentativa))
        break
      }
    }
  }

  return alvos
}

/**
 * As que já estavam sem porta quando o guarda foi escrito.
 *
 * Quatro delas são controle de privacidade — revogar compartilhamento de dado
 * corporal, mudar a privacidade de uma atividade, apagar medição e apagar
 * atividade. O lado do servidor existe e a pessoa não tem por onde chegar
 * nele, o que é pior que uma tela faltando: é uma promessa de controle que o
 * aplicativo não cumpre.
 */
const SEM_PORTA_CONHECIDAS = [
  'src/features/active-workout/actions.ts → saveWorkoutPreferencesAction',
  'src/features/synse-body/actions.ts → deleteBodyMeasurementAction',
  'src/features/synse-body/actions.ts → grantBodyShareAction',
  'src/features/synse-body/actions.ts → revokeBodyShareAction',
  'src/features/synse-run/actions.ts → deleteActivityAction',
  'src/features/synse-run/actions.ts → updateActivityPrivacyAction',
].sort()

function actionsSemPorta(): string[] {
  const arquivos = fg.sync(['src/**/*.{ts,tsx}'], { cwd: RAIZ })
  const bruto = new Map(arquivos.map((a) => [a, readFileSync(join(RAIZ, a), 'utf8')]))
  const limpo = new Map([...bruto].map(([a, c]) => [a, semComentarios(c)]))

  /*
   * Quem está pendurado numa rota.
   *
   * Raiz é tudo em `src/app`: página, layout, rota de API, `middleware`. De
   * lá a busca desce pelos `import`, e só o que ela visita conta como
   * alcançável a partir de uma tela.
   */
  const alcancaveis = new Set<string>()
  const fila = arquivos.filter((a) => a.startsWith('src/app/') || a === 'src/middleware.ts')

  while (fila.length > 0) {
    const atual = fila.pop() as string
    if (alcancaveis.has(atual)) continue
    alcancaveis.add(atual)
    for (const vizinho of importados(atual, limpo.get(atual) ?? '')) {
      if (!alcancaveis.has(vizinho)) fila.push(vizinho)
    }
  }

  const orfas: string[] = []

  for (const [arquivo, codigo] of limpo) {
    if (!/^\s*['"]use server['"]/.test(bruto.get(arquivo) ?? '')) continue

    for (const [, nome] of codigo.matchAll(/export\s+async\s+function\s+(\w+)/g)) {
      const chamada = new RegExp(`\\b${nome}\\b`)
      const chamadaViva = [...limpo].some(
        ([outro, c]) => outro !== arquivo && alcancaveis.has(outro) && chamada.test(c),
      )
      if (!chamadaViva) orfas.push(`${arquivo} → ${nome}`)
    }
  }

  return orfas.sort()
}

describe('toda server action tem uma porta', () => {
  it('nenhuma action nova sem tela que a alcance', () => {
    /*
     * Falhou com um nome novo? A action foi escrita e ninguém a alcança —
     * ou o componente que a chama não está pendurado em tela nenhuma.
     * Ligue-a — não acrescente o nome à lista acima.
     *
     * Falhou com um nome a menos? Alguém consertou uma das antigas: tire o
     * nome da lista, que é a comemoração.
     */
    expect(actionsSemPorta()).toEqual(SEM_PORTA_CONHECIDAS)
  })

  it('e o grafo chega mesmo até as telas', () => {
    /*
     * O controle. Sem ele, um `importados` que devolvesse sempre vazio
     * deixaria tudo "inalcançável" — ou, pior, um bug que marcasse tudo como
     * alcançável faria a asserção de cima passar por omissão.
     *
     * `salvarProgramaAction` é chamada por `program-form.tsx`, que a página
     * de programas renderiza: se o caminho de duas pernas não for percorrido,
     * ela aparece como órfã.
     */
    const orfas = actionsSemPorta()
    expect(orfas).not.toContain('src/features/programs/admin-actions.ts → salvarProgramaAction')
    expect(orfas).not.toContain('src/features/programs/admin-actions.ts → apagarProgramaAction')
    expect(orfas).not.toContain('src/features/recipes/admin-actions.ts → apagarReceitaAction')
    expect(orfas.length).toBeGreaterThan(0)
  })
})
