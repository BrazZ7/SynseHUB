import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * O contrato da ponte de saúde existe duas vezes.
 *
 * Em `src/features/synse-body/health/ponte.ts`, que é o que a aplicação usa, e
 * em `native/synse-health/src/definitions.ts`, que é o que o pacote publicável
 * expõe — ele não pode importar da aplicação.
 *
 * Duplicação assim diverge em silêncio: alguém renomeia um campo de um lado, o
 * Swift devolve a chave antiga, e o percentual de gordura chega `undefined`
 * sem erro nenhum. Este teste compara os dois.
 */

const ler = (caminho: string) => readFileSync(join(process.cwd(), caminho), 'utf8')

const app = ler('src/features/synse-body/health/ponte.ts')
const plugin = ler('native/synse-health/src/definitions.ts')
const amostraPura = ler('src/features/synse-body/health/amostra.ts')

/** Os campos declarados dentro de um `type X = { ... }` ou `interface X { ... }`. */
function campos(fonte: string, tipo: string): string[] {
  const inicio = fonte.search(new RegExp(`export (type ${tipo} = \\{|interface ${tipo} \\{)`))
  if (inicio < 0) throw new Error(`Tipo ${tipo} não encontrado`)
  const fim = fonte.indexOf('\n}', inicio)
  return [...fonte.slice(inicio, fim).matchAll(/^ {2}(\w+)\??:/gm)].map((m) => m[1]).sort()
}

/** Os membros de uma união de strings literais. */
function literais(fonte: string, tipo: string): string[] {
  const re = new RegExp(`export type ${tipo} =([^\\n]*(?:\\n\\s+\\|[^\\n]*)*)`)
  const bloco = re.exec(fonte)
  if (!bloco) throw new Error(`União ${tipo} não encontrada`)
  return (bloco[1].match(/'[\w-]+'/g) ?? []).sort()
}

describe('contrato da ponte de saúde', () => {
  it('a amostra tem os mesmos campos nos dois lados', () => {
    expect(campos(plugin, 'HealthSample')).toEqual(campos(app, 'AmostraNativa'))
  })

  it('os tipos de amostra são os mesmos nos três lugares', () => {
    /*
     * Três e não dois: o nativo devolve a etiqueta como texto, a ponte a
     * recebe e o módulo puro a consome. Um tipo acrescentado no Kotlin e
     * esquecido no `TipoDeAmostra` chegaria como amostra que nada agrupa.
     */
    const doPlugin = literais(plugin, 'HealthSampleType')
    const doPuro = literais(amostraPura, 'TipoDeAmostra')

    expect(doPlugin).toEqual(doPuro)
  })

  it('as razões de indisponibilidade são as mesmas', () => {
    const extrair = (fonte: string, marca: string) =>
      (new RegExp(`${marca}([^\\n]+)`).exec(fonte)?.[1].match(/'[A-Z_]+'/g) ?? []).sort()

    expect(extrair(plugin, 'reason\\?:')).toEqual(extrair(app, 'reason\\?:'))
    expect(extrair(plugin, 'reason\\?:')).not.toEqual([])
  })

  it('as duas fontes têm o mesmo nome dos dois lados', () => {
    // `provider` no nativo, `FonteDeSaudeId` no puro: os valores têm de bater.
    const doPlugin = (plugin.match(/'(apple_health|health_connect)'/g) ?? []).sort()
    const doPuro = literais(amostraPura, 'FonteDeSaudeId')

    expect([...new Set(doPlugin)]).toEqual([...new Set(doPuro)])
  })

  it('a ponte declara os quatro métodos que o nativo implementa', () => {
    const metodos = (fonte: string, tipo: string) =>
      [...fonte.slice(fonte.indexOf(tipo)).matchAll(/^ {2}(\w+)\(/gm)].map((m) => m[1]).sort()

    expect(metodos(app, 'type PluginDeSaude')).toEqual(
      metodos(plugin, 'interface SynseHealthPlugin'),
    )
  })
})
