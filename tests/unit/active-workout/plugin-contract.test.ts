import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * O contrato da ponte nativa existe duas vezes.
 *
 * Em `src/features/active-workout/platform/types.ts`, que é o que a aplicação
 * usa, e em `native/synse-workout-activity/src/definitions.ts`, que é o que o
 * pacote publicável expõe — ele não pode importar da aplicação.
 *
 * Duplicação assim diverge em silêncio: alguém acrescenta um campo de um lado,
 * o Swift lê `null` do outro, e o cartão da tela bloqueada aparece sem a carga.
 * Este teste compara os dois.
 */

const ler = (caminho: string) => readFileSync(join(process.cwd(), caminho), 'utf8')

const app = ler('src/features/active-workout/platform/types.ts')
const plugin = ler('native/synse-workout-activity/src/definitions.ts')

/** Os campos declarados dentro de um `type X = { ... }`. */
function campos(fonte: string, tipo: string): string[] {
  const inicio = fonte.indexOf(`export type ${tipo} = {`)
  if (inicio < 0) throw new Error(`Tipo ${tipo} não encontrado`)
  const fim = fonte.indexOf('\n}', inicio)
  return [...fonte.slice(inicio, fim).matchAll(/^\s{2}(\w+)[?]?:/gm)].map((m) => m[1]).sort()
}

describe('contrato da ponte nativa', () => {
  it('LiveWorkoutState tem os mesmos campos nos dois lados', () => {
    const daAplicacao = campos(app, 'LiveWorkoutState')
    // `planName` é extra no plugin: o iOS o usa como atributo fixo da Live
    // Activity, e ele não muda durante o treino.
    const doPlugin = campos(plugin, 'LiveWorkoutState').filter((c) => c !== 'planName')

    expect(doPlugin).toEqual(daAplicacao)
  })

  it('as ações remotas são as mesmas', () => {
    const extrair = (fonte: string) =>
      /export type RemoteAction =([^\n]+(?:\n\s+\|[^\n]+)*)/
        .exec(fonte)![1]
        .match(/'(\w+)'/g)!
        .sort()

    expect(extrair(plugin)).toEqual(extrair(app))
  })

  it('o instante do descanso atravessa como número, nunca como texto', () => {
    /*
     * Se `restEndsAt` virasse string formatada, o Swift e o Kotlin perderiam a
     * capacidade de animar o cronômetro sozinhos — e o app teria de acordar a
     * cada segundo para atualizar o texto, que é o defeito que todo o desenho
     * evita.
     */
    expect(app).toMatch(/restEndsAt: number \| null/)
    expect(plugin).toMatch(/restEndsAt: number \| null/)
  })

  it('os métodos declarados no plugin são os que a aplicação chama', () => {
    const daAplicacao = [...app.matchAll(/^\s{2}(\w+)\(/gm)].map((m) => m[1])
    for (const metodo of ['isSupported', 'requestPermission', 'start', 'update', 'restFinished', 'stop']) {
      expect(daAplicacao).toContain(metodo)
      expect(plugin).toContain(`${metodo}(`)
    }
  })
})

describe('as implementações nativas respondem ao contrato', () => {
  const swift = ler('native/synse-workout-activity/ios/Sources/SynseWorkoutActivityPlugin.swift')
  const kotlin = ler(
    'native/synse-workout-activity/android/src/main/java/com/synse/workout/SynseWorkoutActivityPlugin.kt',
  )

  it('cada método do contrato existe no Swift e no Kotlin', () => {
    for (const metodo of ['isSupported', 'requestPermission', 'start', 'update', 'restFinished', 'stop']) {
      expect(swift, `Swift sem ${metodo}`).toContain(`func ${metodo}(`)
      expect(kotlin, `Kotlin sem ${metodo}`).toContain(`fun ${metodo}(`)
    }
  })

  it('os dois emitem remoteAction', () => {
    expect(swift).toContain('notifyListeners("remoteAction"')
    expect(kotlin).toContain('notifyListeners("remoteAction"')
  })

  it('o Swift converte o epoch em Date, em vez de receber texto pronto', () => {
    expect(swift).toMatch(/Date\(timeIntervalSince1970: \$0 \/ 1000\)/)
  })
})
