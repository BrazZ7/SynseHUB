import { describe, expect, it } from 'vitest'

import { ordenarFila, type OperacaoOrdenavel } from '@/features/active-workout/storage/ordem'

/**
 * A ordem em que a fila do treino sobe.
 *
 * O risco real está no desfazer com o aparelho sem rede. `unique (session_id,
 * exercise_id, set_number)` (0026) existe para que duas "série 2" no mesmo
 * exercício não entrem — "não é reenvio, é dado errado". Quem conclui a série
 * 3, desfaz e conclui de novo tem três operações na fila para o mesmo número.
 *
 * Fora de ordem, a correção chega antes do desfazer, o banco recusa pela
 * unicidade, a fila insiste oito vezes e desiste. A tela então diz "uma série
 * não pôde ser enviada" por causa de uma série que a pessoa fez e corrigiu.
 */

const inicio = (clientId: string): OperacaoOrdenavel => ({ kind: 'START', clientId })
const serie = (clientId: string, completedAt: number): OperacaoOrdenavel => ({
  kind: 'SET',
  clientId,
  completedAt,
})
const desfazer = (clientId: string, serieClientId: string): OperacaoOrdenavel => ({
  kind: 'UNDO',
  clientId,
  serieClientId,
})
const fim = (clientId: string): OperacaoOrdenavel => ({ kind: 'FINISH', clientId })

const ids = (fila: OperacaoOrdenavel[]) => ordenarFila(fila).map((o) => o.clientId)

describe('a ordem da fila', () => {
  it('abre o treino antes de tudo, mesmo enfileirado por último', () => {
    // O IndexedDB devolve na ordem da chave, que é o `clientId` — ordem
    // nenhuma. Série que chega a uma sessão que o servidor não conhece é série
    // perdida.
    expect(ids([fim('f'), serie('s1', 10), inicio('i')])).toEqual(['i', 's1', 'f'])
  })

  it('encerra por último', () => {
    expect(ids([fim('f'), serie('s1', 10), serie('s2', 20)])).toEqual(['s1', 's2', 'f'])
  })

  it('manda as séries na ordem em que foram concluídas', () => {
    expect(ids([serie('s3', 30), serie('s1', 10), serie('s2', 20)])).toEqual(['s1', 's2', 's3'])
  })

  it('põe o desfazer logo atrás da série que ele desfaz', () => {
    /*
     * O caso que a restrição de unicidade cobra. `s3` é a série errada, `u` a
     * desfaz, `s3b` é a correção — com o mesmo número de série. Nesta ordem o
     * banco aceita as três.
     */
    const fila = [serie('s3b', 300), desfazer('u', 's3'), serie('s3', 200), inicio('i')]
    expect(ids(fila)).toEqual(['i', 's3', 'u', 's3b'])
  })

  it('o desfazer da série que já subiu vai depois das séries e antes do fim', () => {
    /*
     * O caso comum, não a exceção: a fila sobe em segundos e o desfazer
     * acontece durante o descanso, quando a série já chegou ao servidor.
     */
    const fila = [fim('f'), desfazer('u', 's-ja-subiu'), serie('s1', 10)]
    expect(ids(fila)).toEqual(['s1', 'u', 'f'])
  })

  it('dois desfazeres da mesma série ficam juntos atrás dela', () => {
    // Não deveria acontecer, mas acontece: duas passagens da fila que não
    // tiveram resposta. `desfazer_serie` é idempotente; a ordem não pode
    // espalhá-los pela fila.
    const fila = [desfazer('u2', 's1'), serie('s1', 10), desfazer('u1', 's1')]
    expect(ids(fila)).toEqual(['s1', 'u2', 'u1'])
  })

  it('não perde nem duplica nenhuma operação', () => {
    /*
     * O controle que importa numa função que remonta lista: reordenar é
     * mover, nunca somar ou subtrair. Uma operação perdida aqui é uma série
     * que nunca sobe, e sem erro nenhum.
     */
    const fila = [
      fim('f'),
      desfazer('u', 's2'),
      serie('s2', 20),
      serie('s1', 10),
      inicio('i'),
      desfazer('u2', 'sumida'),
    ]
    const saida = ordenarFila(fila)

    expect(saida).toHaveLength(fila.length)
    expect([...saida].map((o) => o.clientId).sort()).toEqual(
      [...fila].map((o) => o.clientId).sort(),
    )
  })

  it('não muda a fila que recebeu', () => {
    // A fila vem do IndexedDB e é lida em outros lugares; ordenar não pode
    // mexer no que chegou.
    const fila = [serie('s2', 20), serie('s1', 10)]
    ordenarFila(fila)
    expect(fila.map((o) => o.clientId)).toEqual(['s2', 's1'])
  })

  it('fila vazia não quebra', () => {
    expect(ordenarFila([])).toEqual([])
  })

  it('série sem instante de conclusão não embaralha o resto', () => {
    // Defesa para registro gravado por uma versão anterior do app: ele vai
    // para o começo das séries em vez de derrubar a ordenação.
    const fila = [serie('s2', 20), { kind: 'SET' as const, clientId: 'antiga' }]
    expect(ids(fila)).toEqual(['antiga', 's2'])
  })
})
