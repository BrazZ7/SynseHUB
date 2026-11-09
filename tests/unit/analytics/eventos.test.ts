import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  EVENTOS,
  NAO_MEDIDO,
  evento,
  rotuloValido,
  type NomeDeEvento,
} from '@/features/analytics/eventos'

/**
 * O catálogo de eventos do produto — prioridade 8 do pedido.
 *
 * Não havia instrumentação nenhuma: `grep -rln "analytics|posthog|plausible|
 * gtag(" src/` não devolvia nada, e não havia como responder "quantos treinos
 * iniciados viram concluídos".
 *
 * O que estes testes protegem não é a existência do catálogo — é a honestidade
 * dele. Catálogo que descreve eventos que ninguém emite é documentação de
 * ficção, e pior que catálogo nenhum: alguém monta um painel em cima dele e
 * decide com um número que nunca existiu.
 */

const RAIZ = process.cwd()

const fonte = (caminho: string) => readFileSync(join(RAIZ, caminho), 'utf8')

describe('o catálogo', () => {
  it('cada evento é emitido do arquivo que ele declara', () => {
    /*
     * O teste central. `origem` é caminho de arquivo justamente para poder ser
     * conferido: se o evento for movido e o catálogo não acompanhar, isto
     * falha.
     */
    const semEmissao = EVENTOS.filter((item) => !fonte(item.origem).includes(item.nome))
    expect(semEmissao.map((item) => `${item.nome} → ${item.origem}`)).toEqual([])
  })

  it('o nome de cada evento é aceito pelo banco', () => {
    /*
     * A lista fechada do `check (name in (...))` da 0060 é o contrato. Evento
     * no catálogo e fora do banco falharia silenciosamente: `registrarEvento`
     * engole a falha de propósito, para não derrubar a operação que observa.
     */
    const migration = fonte('src/db/migrations/0060_eventos_do_produto.sql')
    const bloco = migration.slice(
      migration.indexOf('name            text not null check'),
      migration.indexOf('user_profile_id uuid'),
    )
    for (const item of EVENTOS) expect(bloco).toContain(`'${item.nome}'`)
  })

  it('cada rótulo declarado é aceito pelo banco', () => {
    const migration = fonte('src/db/migrations/0060_eventos_do_produto.sql')
    const bloco = migration.slice(
      migration.indexOf('rotulo          text check'),
      migration.indexOf('/** Número, quando'),
    )
    for (const item of EVENTOS) {
      for (const rotulo of item.rotulos) expect(bloco).toContain(`'${rotulo}'`)
    }
  })

  it('não há evento repetido', () => {
    const nomes = EVENTOS.map((item) => item.nome)
    expect(new Set(nomes).size).toBe(nomes.length)
  })

  it('cada evento diz o que afirma, no indicativo', () => {
    /*
     * "Significado" vago é o que torna uma série temporal ilegível seis meses
     * depois. O teste não julga a prosa; ele exige que haja prosa, e frase
     * inteira — não o nome do evento repetido em outras palavras.
     */
    for (const item of EVENTOS) {
      expect(item.significado.length).toBeGreaterThan(40)
      expect(item.significado).toMatch(/\.$|\.\s|\./)
    }
  })

  it('o que não é medido está escrito, com a razão', () => {
    /*
     * Indicador ausente que ninguém registra volta como pergunta — "e o uso
     * dos widgets?" — e recebe uma resposta inventada. Os dois que o pedido
     * lista e o produto não tem como medir estão nomeados.
     */
    const indicadores = NAO_MEDIDO.map((item) => item.indicador)
    expect(indicadores).toContain('Uso dos widgets')
    expect(indicadores).toContain('Indicações convertidas em usuários ativos')
    for (const item of NAO_MEDIDO) expect(item.porque.length).toBeGreaterThan(30)
  })
})

describe('o rótulo', () => {
  it('é aceito quando o evento o declara', () => {
    expect(rotuloValido('ENTRADA_ESCOLHIDA', 'ACADEMIA')).toBe(true)
    expect(rotuloValido('LEMBRETE_ALTERADO', 'DESLIGADO')).toBe(true)
  })

  it('é recusado quando o evento não o declara', () => {
    // Evitar que o `check constraint` estoure no meio de uma operação que a
    // instrumentação deveria apenas observar.
    expect(rotuloValido('ENTRADA_ESCOLHIDA', 'CORRIDA')).toBe(false)
    expect(rotuloValido('TREINO_INICIADO', 'TREINO')).toBe(false)
  })

  it('a ausência de rótulo é sempre aceita', () => {
    // O rótulo detalha; ele não identifica o evento.
    expect(rotuloValido('TREINO_INICIADO')).toBe(true)
    expect(rotuloValido('ENTRADA_ESCOLHIDA', null)).toBe(true)
  })

  it('evento desconhecido é recusado', () => {
    expect(rotuloValido('NAO_EXISTE' as NomeDeEvento)).toBe(false)
  })
})

describe('a separação entre técnico e produto', () => {
  it('o catálogo não é o logger', () => {
    /*
     * O pedido manda separar evento técnico de indicador de negócio.
     * `logger.ts` continua sendo erro e evento de sistema; este catálogo é
     * produto. O teste fixa que nenhum nome do catálogo vazou para o logger
     * como se fosse a mesma coisa.
     */
    const logger = fonte('src/lib/logger.ts')
    for (const item of EVENTOS) expect(logger).not.toContain(item.nome)
  })

  it('nenhum evento aceita rótulo de dado sensível', () => {
    /*
     * A tabela não tem campo livre, e os rótulos são lista fechada — mas a
     * lista pode crescer. Esta é a trava contra a primeira tentativa de
     * contrabandear dado sensível para a tabela de métrica, que tem outra
     * política de acesso e outro prazo de guarda que o histórico de saúde.
     */
    const proibidos = /carga|medida|foto|local|gps|lesao|lesão|imc|gordura|cpf/i
    const aceitos = EVENTOS.flatMap((item) => item.rotulos)
    expect(aceitos.filter((rotulo) => proibidos.test(rotulo))).toEqual([])
  })

  it('e nenhum evento leva medida de saúde no número', () => {
    /*
     * `valor` é numérico e aceita qualquer número; o que impede o abuso é o
     * significado declarado. Os três eventos que usam `valor` dizem o que ele
     * é: duração em segundos e quantidade de registros.
     */
    const comValor = EVENTOS.filter((item) => /`valor`|segundos|quantos/.test(item.significado))
    expect(comValor.map((item) => item.nome).sort()).toEqual([
      'REGISTRO_PERDIDO',
      'TREINO_CONCLUIDO',
    ])
  })
})

describe('o evento, pelo nome', () => {
  it('acha o que existe', () => {
    expect(evento('TREINO_CONCLUIDO')?.origem).toBe('src/features/active-workout/actions.ts')
  })

  it('e devolve nada para o que não existe', () => {
    expect(evento('INVENTADO' as NomeDeEvento)).toBeUndefined()
  })
})
