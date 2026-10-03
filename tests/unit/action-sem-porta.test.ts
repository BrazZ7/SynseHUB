import { readFileSync } from 'node:fs'
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

/**
 * Os arquivos que este `import` alcança, já resolvidos para caminho real.
 *
 * `existe` é o conjunto de arquivos conhecidos, e não o disco. A diferença só
 * importa para o controle lá embaixo, que injeta arquivos de mentira para
 * provar que o detector ainda detecta — com `existsSync` eles nunca seriam
 * resolvidos, e o controle testaria a si mesmo.
 */
function importados(
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

/**
 * As que ainda estão sem porta — **nenhuma**.
 *
 * A lista nasceu com seis. Cinco eram controle de privacidade — revogar e
 * conceder compartilhamento de dado corporal, apagar medição, mudar a
 * privacidade de uma corrida e apagá-la — e saíram daqui quando as telas
 * foram construídas: `/app/corpo/compartilhamento`, o apagar no histórico do
 * corpo e o seletor em `/app/run/[id]`.
 *
 * A sexta era `saveWorkoutPreferencesAction`, do treino ativo: as preferências
 * existiam no banco desde a 0026 e o aluno não tinha onde desligar a vibração.
 * Saiu com o painel de ajustes em `components/ajustes-do-treino.tsx`.
 *
 * Vazia, a lista muda de papel: deixa de registrar dívida e passa a ser um
 * piso. Qualquer action nova sem tela derruba a suíte no commit em que
 * aparecer, que é o momento em que custa mais barato consertar.
 */
const SEM_PORTA_CONHECIDAS: string[] = []

/**
 * `extras` são arquivos de mentira, só em memória, para o controle: é como se
 * prova que o detector continua detectando quando a lista de dívida está
 * vazia. Sem eles, `toEqual([])` passaria igual se o caminhador marcasse o
 * repositório inteiro como alcançável.
 */
function actionsSemPorta(extras: Record<string, string> = {}): string[] {
  const doDisco = fg.sync(['src/**/*.{ts,tsx}'], { cwd: RAIZ })
  const bruto = new Map(doDisco.map((a) => [a, readFileSync(join(RAIZ, a), 'utf8')]))
  for (const [caminho, conteudo] of Object.entries(extras)) bruto.set(caminho, conteudo)

  const arquivos = [...bruto.keys()]
  const conhecidos = new Set(arquivos)
  const existe = (caminho: string) => conhecidos.has(caminho)
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
    for (const vizinho of importados(atual, limpo.get(atual) ?? '', existe)) {
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
     * alcançável faria a asserção de cima passar por omissão. Com a lista de
     * dívida vazia, esse segundo risco deixou de ser teórico: `toEqual([])`
     * é exatamente o que um detector quebrado devolve.
     */
    const orfas = actionsSemPorta()

    // Duas e três pernas de import até a página, e o caminhador chega.
    expect(orfas).not.toContain('src/features/programs/admin-actions.ts → salvarProgramaAction')
    expect(orfas).not.toContain('src/features/programs/admin-actions.ts → apagarProgramaAction')
    expect(orfas).not.toContain('src/features/recipes/admin-actions.ts → apagarReceitaAction')
    expect(orfas).not.toContain('src/features/synse-body/actions.ts → revokeBodyShareAction')
    expect(orfas).not.toContain('src/features/synse-body/actions.ts → grantBodyShareAction')
    expect(orfas).not.toContain('src/features/synse-body/actions.ts → deleteBodyMeasurementAction')
    expect(orfas).not.toContain('src/features/synse-run/actions.ts → updateActivityPrivacyAction')
    expect(orfas).not.toContain('src/features/synse-run/actions.ts → deleteActivityAction')
    expect(orfas).not.toContain(
      'src/features/active-workout/actions.ts → saveWorkoutPreferencesAction',
    )
  })

  it('e ainda enxerga uma órfã quando existe uma', () => {
    /*
     * A isca, em memória: uma action que ninguém chama precisa aparecer. Este
     * é o teste que impede a lista vazia de virar um teste que não testa.
     */
    const SOLTA = "'use server'\nexport async function acaoSemPortaDeMentira() {}\n"

    expect(actionsSemPorta({ 'src/features/isca/actions.ts': SOLTA })).toContain(
      'src/features/isca/actions.ts → acaoSemPortaDeMentira',
    )
  })

  it('e não acusa a isca quando uma página a importa', () => {
    /*
     * O outro lado do controle: ligada a uma rota, a mesma action some da
     * lista. Um caminhador que marcasse tudo como órfão passaria no teste
     * anterior e cairia aqui.
     */
    const SOLTA = "'use server'\nexport async function acaoSemPortaDeMentira() {}\n"
    const PAGINA =
      "import { acaoSemPortaDeMentira } from '@/features/isca/actions'\n" +
      'export default function Pagina() {\n  return acaoSemPortaDeMentira\n}\n'

    expect(
      actionsSemPorta({
        'src/features/isca/actions.ts': SOLTA,
        'src/app/isca/page.tsx': PAGINA,
      }),
    ).not.toContain('src/features/isca/actions.ts → acaoSemPortaDeMentira')
  })
})
