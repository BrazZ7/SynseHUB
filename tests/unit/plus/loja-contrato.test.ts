import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * ── O contrato do plugin da loja, conferido contra as duas implementações ────
 *
 * Este arquivo existe por causa de um defeito específico deste projeto.
 *
 * A Live Activity do iOS passou meses chamando `SynseWorkoutIntent`, um tipo
 * que não existia em lugar nenhum do repositório. Ninguém soube porque aquele
 * código nativo nunca era compilado — e quando passou a ser, não compilou.
 *
 * O plugin da cobrança nasce na mesma situação, e pior: **não há conta de
 * loja, não há produto cadastrado e não há aparelho.** Nada aqui jamais
 * executou uma compra. O Kotlin pelo menos compila no workflow do Android; o
 * Swift só vai ser compilado no primeiro build do Codemagic.
 *
 * Então o que dá para garantir daqui é a única coisa que dá: que os três lados
 * **descrevem a mesma interface**. Método que a web chama e o nativo não tem é
 * uma promessa que rejeita em campo, com a folha de pagamento aberta.
 *
 * O que estes testes **não** garantem, e vale dizer com clareza: que a compra
 * funcione. Isso depende de ver acontecer num aparelho.
 */

const RAIZ = process.cwd()
const PLUGIN = 'native/synse-plus-billing'

const ler = (caminho: string) => readFileSync(join(RAIZ, caminho), 'utf8')

const DEFINICOES = ler(`${PLUGIN}/src/definitions.ts`)
const KOTLIN = ler(`${PLUGIN}/android/src/main/java/com/synse/billing/SynsePlusBillingPlugin.kt`)
const SWIFT = ler(`${PLUGIN}/ios/Sources/SynsePlusBillingPlugin.swift`)
const INDEX = ler(`${PLUGIN}/src/index.ts`)

/** Os métodos declarados na interface TypeScript, menos `addListener`. */
function metodosDoContrato(): string[] {
  const corpo = DEFINICOES.slice(DEFINICOES.indexOf('export interface SynsePlusBillingPlugin'))
  return [...corpo.matchAll(/^ {2}(\w+)\(/gm)]
    .map((m) => m[1])
    .filter((nome) => nome !== 'addListener')
}

describe('os métodos existem nos três lados', () => {
  const metodos = metodosDoContrato()

  it('o contrato declara os métodos que a aplicação precisa', () => {
    // Se um destes sair do contrato, é mudança de desenho e tem de passar aqui.
    expect(metodos.sort()).toEqual(
      ['comprar', 'confirmar', 'disponivel', 'precos', 'restaurar'].sort(),
    )
  })

  it.each(metodosDoContrato())('`%s` existe no Kotlin, anotado como @PluginMethod', (metodo) => {
    /*
     * A anotação é o que registra o método na ponte. Uma função sem ela
     * compila, existe no arquivo, e **não é chamável** — o erro em campo é
     * "method not implemented", que não aponta para cá.
     */
    const padrao = new RegExp(`@PluginMethod\\s*\\n\\s*fun ${metodo}\\(`)
    expect(KOTLIN, `@PluginMethod fun ${metodo} não achado no Kotlin`).toMatch(padrao)
  })

  it.each(metodosDoContrato())('`%s` existe no Swift, anotado com @objc', (metodo) => {
    /*
     * Sem `@objc` o método não aparece para a ponte do Capacitor, que resolve
     * por seletor de Objective-C. Mesmo sintoma do Kotlin sem anotação.
     */
    const padrao = new RegExp(`@objc func ${metodo}\\(`)
    expect(SWIFT, `@objc func ${metodo} não achado no Swift`).toMatch(padrao)
  })

  it('e nenhum dos dois lados tem método a mais, registrado e não contratado', () => {
    /*
     * A direção contrária do mesmo defeito: nativo que expõe o que a web não
     * conhece é código morto que parece vivo — e, pior, pode ser chamado por
     * qualquer página carregada no WebView.
     */
    const noKotlin = [...KOTLIN.matchAll(/@PluginMethod\s*\n\s*fun (\w+)\(/g)].map((m) => m[1])
    const noSwift = [...SWIFT.matchAll(/@objc func (\w+)\(/g)].map((m) => m[1])

    expect(noKotlin.sort()).toEqual([...metodos].sort())
    expect(noSwift.sort()).toEqual([...metodos].sort())
  })
})

describe('os eventos', () => {
  it('o único evento declarado é emitido pelas duas plataformas', () => {
    /*
     * Eu criei esta divergência enquanto escrevia: o Swift emitia
     * `transacaoAtualizada` e o contrato não declarava o evento, nem o Android
     * o emitia. Renovação e estorno chegariam no iOS e sumiriam no Android.
     */
    const declarados = [...DEFINICOES.matchAll(/eventName:\s*'([^']+)'/g)].map((m) => m[1])
    expect(declarados).toEqual(['transacaoAtualizada'])

    for (const [lado, fonte] of [
      ['Kotlin', KOTLIN],
      ['Swift', SWIFT],
    ] as const) {
      expect(fonte, `${lado} não emite transacaoAtualizada`).toContain('"transacaoAtualizada"')
    }
  })
})

describe('o nome do plugin', () => {
  it('é o mesmo no registro da web, no Kotlin e no Swift', () => {
    /*
     * O `registerPlugin('X')` da web procura por nome. Divergir faz **todos**
     * os métodos falharem de uma vez, com um erro que fala de método e não de
     * nome — e o mesmo nome aparece em três arquivos diferentes.
     */
    const noIndex = INDEX.match(/registerPlugin<[^>]+>\('([^']+)'\)/)
    const noKotlin = KOTLIN.match(/@CapacitorPlugin\(name = "([^"]+)"\)/)
    const noSwift = SWIFT.match(/@objc\((\w+)\)/)

    expect(noIndex?.[1], 'não achei registerPlugin no index').toBe('SynsePlusBilling')
    expect(noKotlin?.[1], 'não achei @CapacitorPlugin no Kotlin').toBe('SynsePlusBilling')
    // O Swift anuncia a classe; o Capacitor tira o sufixo `Plugin`.
    expect(noSwift?.[1], 'não achei @objc no Swift').toBe('SynsePlusBillingPlugin')
  })
})

describe('o id do produto', () => {
  it('é o mesmo nos três lados', () => {
    /*
     * Id divergente não quebra compilação: a loja simplesmente responde
     * "produto não encontrado", e da tela parece que a assinatura não existe.
     * Com três cópias do mesmo texto, divergir é questão de tempo.
     */
    const noContrato = DEFINICOES.match(/PRODUTO_MENSAL = '([^']+)'/)
    expect(noContrato?.[1]).toBe('synse_plus_mensal')
    expect(KOTLIN).toContain(`const val PRODUTO_MENSAL = "${noContrato![1]}"`)
    expect(SWIFT).toContain(`produtoMensal = "${noContrato![1]}"`)
  })
})

describe('a regra que o plugin não pode quebrar', () => {
  it('nenhum dos dois lados finaliza a compra antes do servidor', () => {
    /*
     * A ordem é: comprar → servidor verifica e grava → `confirmar`. Reconhecer
     * antes é dizer à loja "entreguei" sem ter entregue, e aí uma falha na
     * verificação deixa a pessoa paga e sem acesso — **e sem o estorno
     * automático**, que é justamente o que a falta de reconhecimento provoca.
     *
     * Então o reconhecimento só pode aparecer dentro de `confirmar`.
     */
    const confirmarNoKotlin = KOTLIN.slice(KOTLIN.indexOf('fun confirmar('))
    const foraDoConfirmar = KOTLIN.slice(0, KOTLIN.indexOf('fun confirmar('))
    expect(confirmarNoKotlin).toContain('acknowledgePurchase')
    expect(foraDoConfirmar, 'Kotlin reconhece a compra fora de `confirmar`').not.toContain(
      'acknowledgePurchase(',
    )

    const confirmarNoSwift = SWIFT.slice(SWIFT.indexOf('func confirmar('))
    const foraNoSwift = SWIFT.slice(0, SWIFT.indexOf('func confirmar('))
    expect(confirmarNoSwift).toContain('.finish()')
    expect(foraNoSwift, 'Swift finaliza a transação fora de `confirmar`').not.toContain('.finish()')
  })

  it('e o id do perfil é mandado à loja nas duas, senão a notificação chega sem dono', () => {
    /*
     * `obfuscatedAccountId` e `appAccountToken` são a única amarra entre a
     * assinatura da loja e a conta do Synse. Sem eles, a renovação que chega
     * meses depois não tem a quem ser aplicada — e isso não falha: fica
     * silenciosamente sem efeito.
     */
    expect(KOTLIN).toContain('setObfuscatedAccountId')
    expect(SWIFT).toContain('.appAccountToken(')
  })
})
