import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * As esteiras de build, conferidas contra o projeto que elas compilam.
 *
 * ── Por que isto é teste e não confiança ────────────────────────────────────
 *
 * Um arquivo de CI combina com o projeto no dia em que é escrito e desencontra
 * em silêncio depois. Os dois desencontros que importam aqui já têm nome:
 *
 *   - **A versão do SDK.** `variables.gradle` pede `compileSdk 36`; o workflow
 *     instala `platforms;android-36`. Subir o `compileSdk` sem subir o workflow
 *     dá build vermelho — ou, pior, verde com a plataforma errada.
 *   - **Os nomes das variáveis de assinatura.** `app/build.gradle` lê
 *     `SYNSE_KEYSTORE_FILE` e companhia; o workflow as exporta. Renomear num
 *     lado deixa `temAssinatura` falso, e aí o Gradle entrega um pacote **sem
 *     assinatura** com um aviso no log. A Play Console recusa depois, longe
 *     daqui.
 *
 * O segundo é o mais perigoso dos dois porque o build passa. É a mesma forma do
 * defeito do iOS — algo que compila e não funciona — e é por isso que o
 * workflow confere a assinatura do pacote antes de publicá-lo, e por isso este
 * teste confere que essa conferência existe.
 *
 * Nada aqui roda um build. Isto é a descrição; o build é no runner.
 */

const RAIZ = process.cwd()
const ler = (caminho: string) => readFileSync(join(RAIZ, caminho), 'utf8')

const ANDROID_YML = ler('.github/workflows/android.yml')
const PREPARAR_CHAVE = ler('scripts/android/preparar-a-chave.sh')
const CODEMAGIC = ler('codemagic.yaml')
const VARIAVEIS = ler('android/variables.gradle')
const APP_GRADLE = ler('android/app/build.gradle')
const PBXPROJ = ler('ios/App/App.xcodeproj/project.pbxproj')

describe('o workflow do Android', () => {
  it('instala a plataforma que o projeto pede', () => {
    const achado = VARIAVEIS.match(/compileSdkVersion\s*=\s*(\d+)/)
    expect(achado, 'não achei compileSdkVersion em variables.gradle').toBeTruthy()
    const sdk = achado![1]

    expect(ANDROID_YML).toContain(`platforms;android-${sdk}`)
    // As build-tools acompanham a plataforma; o `apksigner` e o `aapt2` que o
    // workflow chama saem daí.
    expect(ANDROID_YML).toMatch(new RegExp(`build-tools;${sdk}\\.`))
    expect(ANDROID_YML).toMatch(new RegExp(`build-tools/${sdk}\\.`))
  })

  it('exporta exatamente as variáveis que o Gradle lê', () => {
    /*
     * `valorDaChave('storeFile', 'SYNSE_KEYSTORE_FILE')` e as três irmãs. O
     * nome é o contrato entre os dois arquivos, e errá-lo não quebra nada: só
     * desliga a assinatura.
     */
    const doGradle = [...APP_GRADLE.matchAll(/'(SYNSE_[A-Z_]+)'/g)].map((m) => m[1])
    expect(doGradle.length).toBeGreaterThanOrEqual(6)

    for (const variavel of new Set(doGradle)) {
      expect(ANDROID_YML, `${variavel} não aparece no workflow`).toContain(variavel)
    }
  })

  it('confere a assinatura antes de publicar o pacote', () => {
    /*
     * Sem chave, o build é **verde** e o pacote sai sem assinatura. Esta é a
     * única coisa entre isso e descobrir na Play Console.
     */
    expect(ANDROID_YML).toContain('apksigner')
    expect(ANDROID_YML).toContain('jarsigner -verify')
    // E para o AAB, falha explícita: `jarsigner` não devolve código de erro
    // útil em toda versão, então o workflow procura "jar verified" na saída.
    expect(ANDROID_YML).toContain('jar verified')
  })

  it('exige que o APK assinado exista, pelo nome que ele tem quando é assinado', () => {
    /*
     * Rodado de verdade neste projeto: sem as variáveis de chave, o Gradle
     * termina em **verde** e troca o nome do arquivo para
     * `app-release-unsigned.apk`. Ou seja, o caminho que o workflow confere
     * simplesmente não existe. Sem este `if`, a falha aparece como "arquivo
     * não encontrado" do `apksigner` — correto e ilegível.
     */
    expect(ANDROID_YML).toMatch(/if \[ ! -f "\$APK" \]/)
    expect(ANDROID_YML).toMatch(/::error::Não saiu APK assinado/)
  })

  it('para quando falta o segredo da chave, em vez de entregar pacote sem assinatura', () => {
    expect(ANDROID_YML).toContain('ANDROID_KEYSTORE_BASE64')
    expect(ANDROID_YML).toMatch(/::error::Falta o segredo/)
  })

  it('os segredos chegam só por `env`, nunca interpolados no comando', () => {
    /*
     * O repositório é público, e o log do build também.
     *
     * `${{ secrets.X }}` escrito dentro de um `run:` põe o valor na linha de
     * comando — visível em rastreio de shell e em qualquer coisa que registre
     * `argv`. Passando por `env:`, ele chega como variável de ambiente, que não
     * aparece em nenhum dos dois.
     *
     * Então a regra é posicional e fácil de conferir: toda aparição de
     * `secrets.` tem de ser um mapeamento `NOME: ${{ secrets.NOME }}`.
     */
    const linhas = ANDROID_YML.split('\n').filter((linha) => !linha.trim().startsWith('#'))

    const usos = linhas.filter((linha) => /\$\{\{\s*secrets\./.test(linha))
    // Controle: se o arquivo deixar de usar segredo, este teste não pode
    // passar por vacuidade.
    expect(usos.length).toBeGreaterThanOrEqual(4)

    const foraDoEnv = usos.filter(
      // `[A-Z0-9_]` e não `[A-Z_]`: `KEYSTORE_BASE64` tem dígitos, e a primeira
      // versão deste teste reprovou o arquivo por isso.
      (linha) => !/^\s*[A-Z0-9_]+:\s*\$\{\{\s*secrets\.[A-Z0-9_]+\s*\}\}\s*$/.test(linha),
    )
    expect(foraDoEnv).toEqual([])
  })

  it('e nenhum `echo` manda segredo para a saída', () => {
    /*
     * Duas linhas do arquivo citam o nome de um segredo e são seguras — vale
     * dizer por que, para a próxima não ser:
     *
     *   - `echo "::error::Falta o segredo ANDROID_KEYSTORE_BASE64."` imprime o
     *     **nome**, que é o que a pessoa precisa ler para resolver.
     *   - `echo "$KEYSTORE_BASE64" | base64 -d > arquivo` manda o valor para o
     *     `base64`, que escreve num arquivo. Nada vai para o log.
     *
     * O que não pode é um `echo` de valor de segredo sem consumidor.
     */
    const linhas = ANDROID_YML.split('\n').filter((linha) => !linha.trim().startsWith('#'))

    const ecos = linhas.filter((linha) => /\becho\s+"?\$\{?[A-Z_]*(KEYSTORE|PASSWORD|ALIAS)/.test(linha))
    const semConsumidor = ecos.filter((linha) => !/\|\s*base64\s+-d/.test(linha))
    expect(semConsumidor).toEqual([])
  })

  it('não usa anchor de YAML, que o GitHub Actions recusa', () => {
    /*
     * `paths: &nativo` passa em qualquer validador de YAML e o parser do
     * GitHub Actions rejeita o arquivo. Custou uma correção aqui; fica
     * travado.
     */
    const linhas = ANDROID_YML.split('\n').filter((linha) => !linha.trim().startsWith('#'))
    expect(linhas.filter((linha) => /^\s*[\w-]+:\s*&\w+\s*$/.test(linha))).toEqual([])
    expect(linhas.filter((linha) => /^\s*[\w-]+:\s*\*\w+\s*$/.test(linha))).toEqual([])
  })

  it('não compila o mesmo commit duas vezes', () => {
    /*
     * Medido, não suposto. Com `push` e `pull_request` juntos, um push num
     * branch com PR aberto gerou **dois** runs do mesmo commit, os dois
     * verdes, em dois runners.
     *
     * A tentativa de resolver por `concurrency` falhou e ensinou o motivo:
     * `github.ref` é `refs/heads/<branch>` no push e `refs/pull/<n>/merge` no
     * pull_request, então os grupos nunca coincidiam. E costurar com
     * `head_ref || ref_name` deixa quem morre na mão de qual evento chegou
     * primeiro — no dia em que o run do PR perde, o check dele fica cancelado.
     *
     * O que ficou: só `push`. Conferido no PR #1 que os jobs do run de `push`
     * aparecem como check do pull request, então nada de cobertura se perdeu.
     */
    // Só o bloco `on:` — `/^ {2}\w+:/` solto pegava `contents: read` e os
    // nomes dos trabalhos, que têm a mesma indentação.
    const linhas = ANDROID_YML.split('\n')
    const inicio = linhas.findIndex((linha) => linha === 'on:')
    expect(inicio, 'não achei o bloco `on:`').toBeGreaterThan(-1)
    const fim = linhas.findIndex((linha, i) => i > inicio && /^\S/.test(linha))
    const gatilhos = linhas
      .slice(inicio + 1, fim)
      .filter((linha) => /^ {2}\w+:/.test(linha))
      .map((linha) => linha.trim())

    expect(gatilhos).toEqual(['workflow_dispatch:', 'push:'])
  })

  it('agrupa por trabalho, e o release não é cancelável', () => {
    /*
     * Os dois trabalhos querem coisas opostas: o guarda deve morrer quando
     * chega commit novo, o pacote nunca. Num grupo único do workflow, um push
     * mataria um release em andamento na mesma referência.
     */
    expect(ANDROID_YML, 'concurrency no topo agrupa os dois trabalhos juntos').not.toMatch(
      /^concurrency:/m,
    )
    // Até o fim da linha, não `\S+`: `${{ github.ref }}` tem espaços dentro, e
    // com `\S+` a captura parava no `${{` — o assert ficava vazio e o mutante
    // sobrevivia.
    const grupos = [...ANDROID_YML.matchAll(/group:\s*(android-.*)/g)].map((m) => m[1].trim())
    expect(grupos).toEqual([
      'android-pacote-${{ github.ref }}',
      'android-compilar-${{ github.ref }}',
    ])

    const doPacote = ANDROID_YML.slice(ANDROID_YML.indexOf('group: android-pacote'))
    expect(doPacote.split('\n')[1]).toContain('cancel-in-progress: false')
  })

  it('o pacote é manual e a compilação é automática', () => {
    // Gerar um AAB assinado é decidir publicar. A compilação do nativo é
    // guarda, e guarda que depende de alguém lembrar não é guarda.
    expect(ANDROID_YML).toMatch(/if: github\.event_name == 'workflow_dispatch'/)
    expect(ANDROID_YML).toMatch(/if: github\.event_name == 'push'/)
  })
})

describe('o workflow do iOS', () => {
  it('assina o bundle id que o projeto declara', () => {
    /*
     * O Codemagic busca o perfil pelo id que está no yaml; o Xcode assina o
     * que está no projeto. Divergência aqui é erro de assinatura no fim de um
     * build de 15 minutos em máquina paga.
     */
    const doProjeto = PBXPROJ.match(/PRODUCT_BUNDLE_IDENTIFIER = (br\.com\.synse\.app);/)
    expect(doProjeto, 'não achei o bundle id do app no projeto').toBeTruthy()
    expect(CODEMAGIC).toContain(`bundle_identifier: ${doProjeto![1]}`)
  })

  it('compila o scheme que existe compartilhado', () => {
    const scheme = CODEMAGIC.match(/XCODE_SCHEME:\s*(\w+)/)
    expect(scheme).toBeTruthy()
    // O arquivo é conferido em `tests/unit/ios/extensao-do-widget.test.ts`;
    // aqui o que importa é o nome combinar com ele.
    expect(scheme![1]).toBe('App')
  })

  it('confere que a extensão entrou no pacote', () => {
    // O espelho da conferência de assinatura do Android: o target pode
    // compilar, ser assinado e não ser embutido.
    expect(CODEMAGIC).toContain('PlugIns/SynseWorkoutWidget.appex')
  })
})

describe('as credenciais de publicação', () => {
  /*
   * O repositório é **público**. Um `.jks` ou um `.p8` comitado aqui é a chave
   * de assinatura na internet — e perder a chave de upload do Android
   * significa não poder mais atualizar o app, enquanto vazá-la significa
   * alguém poder.
   *
   * `android/.gitignore` já cobria a pasta do Android. Este teste cobre o
   * corte na raiz, que é por onde um arquivo fora daquela pasta passaria.
   */
  const gitignore = ler('.gitignore')

  it.each(['*.jks', '*.keystore', '*.p8', '*.p12', '*.mobileprovision', 'keystore.properties'])(
    '%s não pode ser versionado',
    (padrao) => {
      expect(gitignore).toContain(padrao)
    },
  )

  it('o script da chave ensina os nomes que o workflow realmente lê', () => {
    /*
     * `scripts/android/preparar-a-chave.sh` imprime uma lista do que colar em
     * *Settings → Secrets*. Renomear um segredo no workflow e esquecer o
     * script produz instrução errada — e o erro só aparece quando alguém
     * segue a instrução e o build para, com o segredo "faltando" porque tem
     * outro nome.
     */
    for (const segredo of [
      'ANDROID_KEYSTORE_BASE64',
      'ANDROID_KEYSTORE_PASSWORD',
      'ANDROID_KEY_ALIAS',
      'ANDROID_KEY_PASSWORD',
    ]) {
      expect(ANDROID_YML, `${segredo} saiu do workflow`).toContain(segredo)
      expect(PREPARAR_CHAVE, `${segredo} não é mais ensinado pelo script`).toContain(segredo)
    }

    /*
     * E o alias que ele gera é o alias que ele manda colar — garantido por
     * interpolação, não por coincidência. A primeira versão deste teste
     * cobrava o literal `synse` na instrução; o script usa `$ALIAS`, que é o
     * jeito certo, porque trocar o alias lá em cima muda a instrução junto.
     * O teste estava errado, não o script.
     */
    expect(PREPARAR_CHAVE).toMatch(/^ALIAS="[^"]+"/m)
    expect(PREPARAR_CHAVE, 'a instrução repete o alias em vez de interpolar').toMatch(
      /ANDROID_KEY_ALIAS\s+\$ALIAS/,
    )
  })

  it('o script da chave não deixa a senha vazar', () => {
    /*
     * Duas formas de vazar, e as duas já aconteceram em script de setup por
     * aí: imprimir a senha na tela, e passá-la por argumento de linha de
     * comando — onde ela fica visível em `ps` para qualquer processo da
     * máquina enquanto o keytool roda. Daí `-storepass:env`.
     */
    expect(PREPARAR_CHAVE, 'senha por argumento fica visível em `ps`').not.toMatch(
      /-(store|key)pass\s+["$]/,
    )
    expect(PREPARAR_CHAVE).toContain('-storepass:env')
    expect(PREPARAR_CHAVE).toContain('-keypass:env')

    // Lido sem eco, e nunca impresso.
    expect(PREPARAR_CHAVE).toMatch(/read -r -s -p/)
    const linhas = PREPARAR_CHAVE.split('\n').filter((l) => !l.trim().startsWith('#'))
    const ecos = linhas.filter((l) => /\b(echo|printf)\b[^|]*\$\{?(SENHA|SYNSE_SENHA|CONFIRMA)\b/.test(l))
    expect(ecos).toEqual([])
  })

  it('e nenhuma delas está no repositório agora', () => {
    // Controle do teste acima: ignorar o padrão não desfaz um arquivo que já
    // tenha sido comitado antes da regra existir.
    const rastreados = execSync('git ls-files', { cwd: RAIZ, encoding: 'utf8' }).split('\n')
    const credenciais = rastreados.filter((caminho) =>
      /\.(jks|keystore|p8|p12|mobileprovision)$|keystore\.properties$/.test(caminho),
    )
    expect(credenciais).toEqual([])
  })
})

describe('as duas esteiras', () => {
  it('usam a versão de Node que o projeto exige', () => {
    const exigido = JSON.parse(ler('package.json')).engines?.node as string
    expect(exigido).toBeTruthy()
    const minima = Number(exigido.replace(/[^\d.]/g, '').split('.')[0])

    for (const [nome, fonte] of [
      ['android.yml', ANDROID_YML],
      ['codemagic.yaml', CODEMAGIC],
    ] as const) {
      const versoes = [...fonte.matchAll(/node(?:-version)?:\s*(\d+)/g)].map((m) => Number(m[1]))
      expect(versoes.length, `${nome} não declara versão de node`).toBeGreaterThan(0)
      for (const versao of versoes) {
        expect(versao, `${nome} usa node ${versao}, abaixo de ${minima}`).toBeGreaterThanOrEqual(
          minima,
        )
      }
    }
  })

  it('instalam dependências com `npm ci`, não `npm install`', () => {
    // `npm install` resolve de novo e pode trazer versão diferente da que foi
    // testada. O build de hoje tem de usar o que o lock diz.
    for (const fonte of [ANDROID_YML, CODEMAGIC]) {
      expect(fonte).toContain('npm ci')
      expect(fonte).not.toMatch(/^\s*(run|script):\s*npm install\s*$/m)
    }
  })

  it('sincronizam o Capacitor antes de compilar', () => {
    // Sem `cap sync`, o pacote sai sem a tela de falha de conexão e com a
    // configuração antiga.
    expect(ANDROID_YML).toContain('cap sync android')
    expect(CODEMAGIC).toContain('cap sync ios')
  })
})
