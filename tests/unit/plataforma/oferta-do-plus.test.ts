import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { LOJA_DISPONIVEL, mostraPreco, ofertaDoPlus } from '@/lib/plans/oferta-do-plus'
import { ehAppNativo, MARCA_DO_APP } from '@/lib/plataforma/app-nativo'

/**
 * Onde o Synse+ pode ser vendido.
 *
 * O app e o site são o **mesmo site** — o aplicativo é uma janela que carrega
 * `synse.com.br`. Para as lojas, porém, são mundos diferentes: conteúdo
 * digital destravado dentro do app é o que Apple e Google reservam para a
 * cobrança delas.
 *
 * Errar aqui tem duas formas, e as duas custam:
 *
 *   - vender no app pelo Mercado Pago → recusa na revisão, e suspensão se
 *     passar;
 *   - deixar de vender na web → receita perdida sem nenhuma regra pedindo.
 *
 * Nenhuma das duas aparece num teste de tela. Por isso esta decisão é função
 * pura, e por isso o teste da marca do User-Agent está neste mesmo arquivo.
 */

const UA_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
const UA_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'

describe('a marca que identifica o app', () => {
  it('é a mesma no `capacitor.config.ts` e no servidor', () => {
    /*
     * **O teste mais importante deste arquivo.** Se as duas divergirem, o app
     * publicado é tratado como navegador e mostra o caminho de compra que a
     * loja proíbe. Nenhum teste de tela pega isso — ele aparece na revisão da
     * App Store, depois de o build já ter subido.
     */
    const config = readFileSync(join(process.cwd(), 'capacitor.config.ts'), 'utf8')
    const achado = config.match(/appendUserAgent:\s*'([^']+)'/)

    expect(achado, 'não achei `appendUserAgent` no capacitor.config.ts').toBeTruthy()
    expect(achado![1]).toContain(MARCA_DO_APP)
    // E o que o Capacitor acrescenta tem de ser reconhecido pela função.
    expect(ehAppNativo(`${UA_ANDROID} ${achado![1]}`)).toBe(true)
  })

  it('reconhece o app, em cada plataforma', () => {
    expect(ehAppNativo(`${UA_ANDROID} ${MARCA_DO_APP}/1`)).toBe(true)
    expect(ehAppNativo(`${UA_IPHONE} ${MARCA_DO_APP}/1`)).toBe(true)
  })

  it('e não confunde navegador com app', () => {
    expect(ehAppNativo(UA_ANDROID)).toBe(false)
    expect(ehAppNativo(UA_IPHONE)).toBe(false)
    expect(ehAppNativo(null)).toBe(false)
    expect(ehAppNativo(undefined)).toBe(false)
    expect(ehAppNativo('')).toBe(false)
  })
})

describe('dentro do app', () => {
  it('nunca oferece o Mercado Pago — é a regra dura', () => {
    /*
     * Com qualquer combinação do resto. Se algum dia um `if` fizer o Mercado
     * Pago aparecer no app, é aqui que morre.
     */
    for (const provedorSimulado of [true, false]) {
      for (const lojaDisponivel of [true, false]) {
        const oferta = ofertaDoPlus({ noApp: true, lojaDisponivel, provedorSimulado })
        expect(oferta, `noApp + loja=${lojaDisponivel} + simulado=${provedorSimulado}`).not.toBe(
          'mercadopago',
        )
      }
    }
  })

  it('sem a cobrança da loja construída, não vende nada', () => {
    expect(ofertaDoPlus({ noApp: true, lojaDisponivel: false, provedorSimulado: false })).toBe(
      'nenhuma-no-app',
    )
  })

  it('com a cobrança da loja, vende pela loja', () => {
    expect(ofertaDoPlus({ noApp: true, lojaDisponivel: true, provedorSimulado: false })).toBe(
      'loja',
    )
  })

  it('e o preço não aparece', () => {
    /*
     * Parece exagero, porque ninguém compra ali. Mas a regra alcança **levar**
     * à compra, e preço sem botão é instrução para ir procurar onde pagar.
     */
    expect(mostraPreco('nenhuma-no-app')).toBe(false)
  })
})

describe('na web', () => {
  it('vende pelo Mercado Pago', () => {
    expect(ofertaDoPlus({ noApp: false, lojaDisponivel: false, provedorSimulado: false })).toBe(
      'mercadopago',
    )
  })

  it('com provedor simulado, não vende — e por outro motivo', () => {
    /*
     * `sem-provedor` e `nenhuma-no-app` são a mesma ausência de botão com
     * explicações opostas, e eu os colapsei num só valor na primeira versão: a
     * tela dizia "o Synse+ faz parte da sua conta" para quem estava na web
     * esperando um botão que faltou por falta de provedor.
     */
    const oferta = ofertaDoPlus({ noApp: false, lojaDisponivel: false, provedorSimulado: true })
    expect(oferta).toBe('sem-provedor')
    expect(oferta).not.toBe('nenhuma-no-app')
  })

  it('e o preço aparece mesmo com o botão desligado', () => {
    // Na web não há regra de loja. Esconder o valor de quem está decidindo
    // seria esconder a informação que a decisão pede.
    expect(mostraPreco('sem-provedor')).toBe(true)
    expect(mostraPreco('mercadopago')).toBe(true)
  })

  it('a cobrança da loja não vaza para a web', () => {
    expect(ofertaDoPlus({ noApp: false, lojaDisponivel: true, provedorSimulado: false })).toBe(
      'mercadopago',
    )
  })
})

describe('o preço do Synse+ no app do aluno', () => {
  /*
   * Esconder o valor na tela do Synse+ não serve para nada se ele reaparecer
   * numa vitrine, num card da home ou num aviso de cadeado. São oito telas que
   * levam ao Synse+, e qualquer uma delas poderia ganhar "a partir de R$ 29"
   * num commit de marketing.
   *
   * Em vez de tentar entender JSX, este teste cobra uma regra simples: o preço
   * mora num arquivo só, o que o guarda. Quem precisar dele em outro lugar vai
   * ter de passar por aqui e ler o motivo.
   */
  const RAIZ = process.cwd()
  const TELA = 'src/app/(student)/app/synse/page.tsx'

  /*
   * `src/` inteiro, não só `src/app/(student)`. A primeira versão varria
   * apenas a pasta das páginas, e o mutante que importava o preço em
   * `src/features/content/vitrine.tsx` — uma das oito telas que levam ao
   * Synse+ — sobreviveu: o componente mora fora daquele caminho. O teste
   * mediu a pasta errada.
   */
  const PERMITIDOS = [
    // Onde o valor é definido.
    'src/lib/plans/tiers.ts',
    // A tela, que tem a guarda.
    TELA,
    // O servidor, que manda o valor ao provedor. Não renderiza nada.
    'src/features/plus/actions.ts',
    // A persona de demonstração.
    'src/lib/auth/demo-personas.ts',
  ]

  it('é citado só onde foi autorizado, em todo o `src/`', () => {
    const achados = execSync(`grep -rl "PLUS_PRICE" "${join(RAIZ, 'src')}" || true`, {
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean)
      .map((caminho) => caminho.replace(`${RAIZ}/`, ''))
      .sort()

    expect(achados).toEqual([...PERMITIDOS].sort())
  })

  it('e cada preço renderizado tem uma guarda acima dele', () => {
    /*
     * O limite dos testes de texto, e como chegar perto do que falta.
     *
     * Um teste que só confere que o arquivo *menciona* `comPreco` passa com a
     * guarda removida de um dos blocos — o mutante que apagou `comPreco &&` do
     * bloco do preço sobreviveu. O que pegaria de verdade é renderizar a
     * página com `noApp: true` e não achar valor nenhum; o projeto não tem
     * ferramenta de renderização, e acrescentá-la é decisão de outra conversa.
     *
     * Então a aproximação mecânica: toda linha que renderiza o valor precisa
     * ter uma guarda nas linhas acima, dentro do mesmo bloco de JSX. Não é
     * prova, é o que pega o descuido — que é o caso realista.
     */
    const linhas = readFileSync(join(RAIZ, TELA), 'utf8').split('\n')
    const GUARDA = /comPreco|oferta === '/
    /** Linha que abre um bloco condicional de JSX: `{algo && (` ou `{algo ? (`. */
    const ABRE_BLOCO = /^\s*\{.*(&&|\?)\s*\($/

    /*
     * A condicional **que envolve** a linha, não qualquer guarda próxima. Uma
     * janela de 25 linhas acima parecia bastar e não bastava: ao remover a
     * guarda do aviso de renovação, ela achava a guarda do bloco anterior e
     * o mutante sobreviveu.
     */
    const desprotegidos: number[] = []
    linhas.forEach((linha, i) => {
      if (!/formatCurrency\(PLUS_PRICE/.test(linha)) return
      const abertura = linhas.slice(0, i).findLastIndex((l) => ABRE_BLOCO.test(l))
      if (abertura === -1 || !GUARDA.test(linhas[abertura])) desprotegidos.push(i + 1)
    })

    expect(desprotegidos, `preço sem guarda nas linhas ${desprotegidos.join(', ')}`).toEqual([])
  })

  it('e a tela decide por onde está sendo aberta, de verdade', () => {
    /*
     * `toContain('noAppNativo')` não bastava: a linha de `import` já contém o
     * nome, então trocar a chamada por `noApp: false` passava no teste. É
     * preciso cobrar a chamada no lugar em que ela decide.
     */
    const pagina = readFileSync(join(RAIZ, TELA), 'utf8')
    expect(pagina).toMatch(/noApp:\s*await noAppNativo\(\)/)
    expect(pagina).toMatch(/ofertaDoPlus\(/)
  })
})

describe('o estado em que o projeto está hoje', () => {
  it('a cobrança da loja ainda não existe, e o padrão reflete isso', () => {
    /*
     * Guarda deliberada para se soltar sozinha: no dia em que o IAP e o Play
     * Billing existirem e `LOJA_DISPONIVEL` virar `true`, este teste falha e
     * obriga quem fez a mudança a olhar o resto do arquivo. É o mesmo
     * mecanismo de `tests/unit/comparativo-honesto.test.ts`.
     */
    expect(LOJA_DISPONIVEL).toBe(false)
    expect(ofertaDoPlus({ noApp: true, provedorSimulado: false })).toBe('nenhuma-no-app')
  })
})
