import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * A extensão da Live Activity, conferida sem Xcode.
 *
 * ── Por que estes testes existem ────────────────────────────────────────────
 *
 * Este projeto não tem Mac, e por isso o código nativo nunca foi compilado.
 * Quando ele finalmente foi descrito para compilar, três defeitos apareceram de
 * uma vez — e cada um custaria um build vermelho na CI, que é minuto pago:
 *
 *   1. **Não havia target de extensão.** O Swift da Live Activity compilava
 *      para dentro do aplicativo, onde nenhum widget é carregado.
 *   2. **`SynseWorkoutIntent` não existia.** Quatro chamadas, nenhuma
 *      implementação. O arquivo não compilava.
 *   3. **O piso de plataforma do pacote era maior que o do app** (16 contra
 *      15), e o SPM recusa isso antes de compilar qualquer linha.
 *
 * Nenhum dos três é verificável lendo o produto rodando: são erros de
 * compilação num alvo que não compilava. O que é verificável aqui é a
 * descrição — e é dela que os três vinham.
 *
 * **Isto não substitui o build.** Nada aqui prova que o Swift compila; prova
 * que o projeto está descrito do jeito que a Apple espera. Quem compila é o
 * `codemagic.yaml`, e quem diz que a Live Activity aparece é um iPhone.
 */

const RAIZ = process.cwd()
const PBXPROJ = join(RAIZ, 'ios/App/App.xcodeproj/project.pbxproj')
const FONTES_DO_PLUGIN = join(RAIZ, 'native/synse-workout-activity/ios/Sources')
const PASTA_DA_EXTENSAO = join(RAIZ, 'ios/App/SynseWorkoutWidget')

const projeto = readFileSync(PBXPROJ, 'utf8')

describe('o target da extensão', () => {
  it('existe, e é do tipo que o iOS carrega como widget', () => {
    /*
     * `app-extension` é o ponto todo. Um target de aplicativo a mais, ou uma
     * biblioteca, compilaria e nunca seria carregado.
     */
    expect(projeto).toContain('SynseWorkoutWidget')
    expect(projeto).toContain('com.apple.product-type.app-extension')
  })

  it('tem o id filho do id do aplicativo', () => {
    /*
     * A Apple exige o prefixo, e o Codemagic depende dele: ele busca o perfil
     * da extensão procurando por `br.com.synse.app.*`. Um id solto passa no
     * build e falha na assinatura.
     */
    expect(projeto).toContain('PRODUCT_BUNDLE_IDENTIFIER = br.com.synse.app.SynseWorkoutWidget')
  })

  it('tem piso de iOS 16.1, que é onde a Live Activity começa', () => {
    // `ActivityConfiguration` não existe antes disso.
    expect(projeto).toMatch(/IPHONEOS_DEPLOYMENT_TARGET = 16\.1/)
  })

  it('não gera o Info.plist automaticamente', () => {
    /*
     * O plist gerado não carrega `NSExtensionPointIdentifier`, e sem essa chave
     * o pacote é copiado, assinado, enviado — e nunca carregado. Sem erro
     * nenhum, só uma tela bloqueada vazia.
     */
    expect(projeto).toContain('GENERATE_INFOPLIST_FILE = NO')
    expect(projeto).toContain('INFOPLIST_FILE = SynseWorkoutWidget/Info.plist')
  })
})

describe('a extensão vai dentro do aplicativo', () => {
  it('o aplicativo tem a fase que copia para PlugIns', () => {
    /*
     * `dstSubfolderSpec = 13` é `PlugIns`. Sem esta fase o `.appex` é compilado
     * e fica de fora do `.app`: o build passa, o envio passa, e o widget não
     * existe no aparelho.
     *
     * O `codemagic.yaml` confere a mesma coisa do outro lado, abrindo o `.ipa`.
     */
    expect(projeto).toContain('dstSubfolderSpec = 13')
    expect(projeto).toMatch(/SynseWorkoutWidget\.appex/)
  })

  it('e depende dela, para a ordem de compilação', () => {
    expect(projeto).toContain('PBXTargetDependency')
  })
})

describe('os arquivos da extensão', () => {
  it('o ponto de entrada existe', () => {
    /*
     * Extensão é binário, e binário precisa de `@main`. A Live Activity estava
     * completa e sem entrada: um `Widget` não roda sozinho.
     */
    const entrada = join(PASTA_DA_EXTENSAO, 'SynseWorkoutWidgetBundle.swift')
    expect(existsSync(entrada)).toBe(true)
    const fonte = readFileSync(entrada, 'utf8')
    expect(fonte).toContain('@main')
    expect(fonte).toContain('WidgetBundle')
    expect(fonte).toContain('SynseWorkoutLiveActivity()')
  })

  it('o Info.plist declara o ponto de extensão do WidgetKit', () => {
    const plist = readFileSync(join(PASTA_DA_EXTENSAO, 'Info.plist'), 'utf8')
    expect(plist).toContain('NSExtensionPointIdentifier')
    expect(plist).toContain('com.apple.widgetkit-extension')
  })

  it('a versão do plist vem das variáveis do build', () => {
    /*
     * A App Store recusa o envio quando a extensão tem versão diferente do
     * aplicativo. Lendo da configuração, o `agvtool` da CI numera os dois de
     * uma vez; com número literal aqui, eles divergem no primeiro envio.
     */
    const plist = readFileSync(join(PASTA_DA_EXTENSAO, 'Info.plist'), 'utf8')
    expect(plist).toContain('$(MARKETING_VERSION)')
    expect(plist).toContain('$(CURRENT_PROJECT_VERSION)')
  })

  it('os arquivos compartilhados são referenciados, não copiados', () => {
    /*
     * Duas cópias do contrato divergem, e quando divergem a Live Activity para
     * de receber atualização sem erro nenhum. A extensão aponta para o arquivo
     * que mora no plugin.
     */
    expect(projeto).toContain(
      '../../native/synse-workout-activity/ios/Sources/SynseWorkoutAttributes.swift',
    )
    expect(projeto).toContain(
      '../../native/synse-workout-activity/ios/Sources/SynseWorkoutLiveActivity.swift',
    )
    expect(existsSync(join(FONTES_DO_PLUGIN, 'SynseWorkoutAttributes.swift'))).toBe(true)
    expect(existsSync(join(FONTES_DO_PLUGIN, 'SynseWorkoutLiveActivity.swift'))).toBe(true)
  })

  it('e a extensão não leva o plugin, que depende do Capacitor', () => {
    // O `.appex` não tem bridge de WebView; linkar o Capacitor nele é peso e
    // confusão.
    expect(projeto).not.toContain('SynseWorkoutActivityPlugin.swift')
  })
})

describe('o scheme compartilhado', () => {
  it('existe', () => {
    /*
     * O projeto do Capacitor vem sem scheme compartilhado — o Xcode cria um na
     * primeira abertura, dentro de `xcuserdata`, que não é versionado. Em CI
     * isso aparece como "scheme App not found" na primeira linha do build.
     */
    const pasta = join(RAIZ, 'ios/App/App.xcodeproj/xcshareddata/xcschemes')
    expect(existsSync(pasta)).toBe(true)
    expect(readdirSync(pasta)).toContain('App.xcscheme')
  })
})

describe('o Swift nativo não cita o que não existe', () => {
  /*
   * O defeito que custou mais caro: `BotoesDaAtividade` chamava
   * `SynseWorkoutIntent` em quatro lugares, e esse tipo não existia em lugar
   * nenhum. O arquivo não compilava, e ninguém soube — porque ninguém
   * compilava.
   *
   * A regra é estreita de propósito, para não precisar entender Swift: **todo
   * identificador `Synse*` usado no código nativo tem de ser declarado no
   * código nativo.** É a forma exata do defeito, e pega a reincidência.
   */
  const semComentarios = (texto: string) =>
    texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

  const arquivos = [
    ...readdirSync(FONTES_DO_PLUGIN)
      .filter((nome) => nome.endsWith('.swift'))
      .map((nome) => join(FONTES_DO_PLUGIN, nome)),
    join(PASTA_DA_EXTENSAO, 'SynseWorkoutWidgetBundle.swift'),
  ]

  const codigo = arquivos.map((caminho) => semComentarios(readFileSync(caminho, 'utf8')))

  it('todo tipo Synse usado está declarado', () => {
    const declarados = new Set<string>()
    for (const fonte of codigo) {
      for (const achado of fonte.matchAll(
        /\b(?:struct|class|enum|protocol|typealias|actor)\s+([A-Z]\w*)/g,
      )) {
        declarados.add(achado[1])
      }
    }

    const usados = new Set<string>()
    for (const fonte of codigo) {
      for (const achado of fonte.matchAll(/\bSynse\w*/g)) usados.add(achado[0])
    }

    expect([...usados].filter((nome) => !declarados.has(nome)).sort()).toEqual([])
  })

  it('e o controle: há tipo Synse de verdade para conferir', () => {
    // Sem isto, um `semComentarios` que devolvesse vazio passaria no teste
    // acima sem ter olhado nada.
    const usados = codigo.join('\n').match(/\bSynse\w*/g) ?? []
    expect(usados.length).toBeGreaterThan(5)
  })
})

describe('os pisos de plataforma combinam', () => {
  it('o pacote do plugin não exige iOS maior que o do aplicativo', () => {
    /*
     * O SPM recusa dependência com plataforma mais alta que a do dependente:
     * "requires minimum platform version 16.0 ... but this target supports
     * 15.0". O pacote estava em 16 e o `CapApp-SPM` do Capacitor em 15 — o
     * build morria antes de compilar.
     *
     * O número do pacote precisa ser <= o piso do target App.
     */
    const plugin = readFileSync(join(RAIZ, 'native/synse-workout-activity/Package.swift'), 'utf8')
    const capApp = readFileSync(join(RAIZ, 'ios/App/CapApp-SPM/Package.swift'), 'utf8')

    const pisoDe = (fonte: string) => {
      const achado = fonte.match(/platforms:\s*\[\.iOS\(\.v(\d+)\)\]/)
      expect(achado, 'não achei a plataforma declarada').toBeTruthy()
      return Number(achado![1])
    }

    const alvoDoApp = projeto.match(/IPHONEOS_DEPLOYMENT_TARGET = (\d+)\.\d+/)
    expect(alvoDoApp).toBeTruthy()

    expect(pisoDe(plugin)).toBeLessThanOrEqual(pisoDe(capApp))
    expect(pisoDe(plugin)).toBeLessThanOrEqual(Number(alvoDoApp![1]))
  })
})
