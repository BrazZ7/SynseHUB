import { describe, expect, it } from 'vitest'

import { porQueIndisponivel } from '@/features/synse-body/providers/standard-ble'

/**
 * A mensagem de quando não dá para ler a balança.
 *
 * Existe porque a primeira versão repassava o texto cru do plugin — "Web
 * Bluetooth API not available in this browser" — em inglês e sem dizer o que
 * fazer. Quem leu isso num computador não descobriu que o caminho era o
 * celular, e foi assim que o erro chegou como se fosse defeito.
 */

describe('por que este navegador não lê balança', () => {
  it('navegador sem Web Bluetooth aponta o celular e a entrada manual', () => {
    const mensagem = porQueIndisponivel(
      new Error('Web Bluetooth API not available in this browser.'),
    )
    expect(mensagem).toMatch(/aplicativo Synse/i)
    expect(mensagem).toMatch(/digitar peso/i)
    // Nada de inglês sobrando na cara da pessoa.
    expect(mensagem).not.toMatch(/not available in this browser/i)
  })

  it('aparelho sem rádio é outra coisa, e diz outra coisa', () => {
    expect(porQueIndisponivel(new Error('No Bluetooth radio available.'))).toMatch(
      /nenhum rádio bluetooth/i,
    )
  })

  it('erro desconhecido não é engolido: o texto original vai junto', () => {
    /*
     * O que não foi previsto precisa chegar inteiro, senão o diagnóstico do
     * próximo caso estranho começa do zero.
     */
    expect(porQueIndisponivel(new Error('GATT operation failed'))).toMatch(
      /GATT operation failed/,
    )
  })

  it('erro que não é Error também vira frase', () => {
    expect(porQueIndisponivel('pane seca')).toMatch(/pane seca/)
    expect(porQueIndisponivel(undefined)).toMatch(/Não foi possível abrir o Bluetooth/i)
  })
})
