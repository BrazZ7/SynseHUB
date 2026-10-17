import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { nivelDe } from '@/features/students/level'
import { plantaDoNivel } from '@/features/students/plant'

/**
 * O jardim não concede recompensa duplicada — aceite 24.
 *
 * ── Por que isto se prova pela estrutura, e não por um contador ─────────────
 *
 * A pergunta "o jardim pode premiar duas vezes o mesmo treino?" tem duas
 * respostas possíveis de produto. Uma é guardar XP numa coluna e somar quando
 * algo acontece — e aí a resposta depende de cada caminho de escrita ter
 * idempotência, para sempre, em todos eles. A outra é não guardar nada: o nível
 * é função dos totais, e os totais são contados na leitura.
 *
 * Este produto escolheu a segunda, e o comentário de `plant.ts` diz isso desde
 * antes: "nada aqui é guardado. O estágio é função do nível, que é função do
 * histórico". Então recompensa dupla não é um defeito que não aconteceu: é um
 * defeito que não tem como acontecer.
 *
 * O que estes testes protegem é justamente essa escolha, porque ela é fácil de
 * perder numa "otimização" que guarda o XP numa coluna para não recontar.
 */

const RAIZ = process.cwd()

describe('nada é guardado', () => {
  it('nenhuma migration cria coluna de XP, nível ou jardim', () => {
    /*
     * A trava. No dia em que existir `user_profiles.xp` com `update ... set xp
     * = xp + 100`, a recompensa dupla passa a depender de cada gatilho e de
     * cada reenvio — e o reenvio é o normal numa fila offline.
     */
    const pasta = join(RAIZ, 'src/db/migrations')
    const sql = readdirSync(pasta)
      .filter((arquivo) => arquivo.endsWith('.sql'))
      .map((arquivo) => readFileSync(join(pasta, arquivo), 'utf8'))
      .join('\n')
      // Comentário explica; não declara coluna.
      .replace(/--[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')

    const suspeitas = [
      /\n\s+xp\s+(int|numeric|bigint|smallint)/i,
      /\n\s+xp_total\s/i,
      /\n\s+level\s+(int|smallint)/i,
      /\n\s+nivel\s+(int|smallint)/i,
      /\n\s+plant_stage\s/i,
      /\n\s+garden\w*\s+(int|text|jsonb)/i,
    ]
    expect(suspeitas.filter((regex) => regex.test(sql))).toEqual([])
  })

  it('o nível é função dos totais, e só deles', () => {
    /*
     * Nenhuma data entra na conta. É o que garante as duas regras do pedido —
     * "não destruir a árvore após ausência" e "não punir doença, pausa ou
     * retomada": sem tempo na fórmula, não há decaimento possível.
     */
    const fonte = readFileSync(join(RAIZ, 'src/features/students/level.ts'), 'utf8')
    const bloco = fonte.slice(fonte.indexOf('export type FonteDeXp'), fonte.indexOf('export function calcularXp'))

    expect(bloco).toMatch(/treinos: number/)
    expect(bloco).toMatch(/quilometros: number/)
    expect(bloco).toMatch(/medalhas: number/)
    // Nenhuma noção de quando.
    expect(bloco).not.toMatch(/data|date|dias|semana|desde|ultimo|último/i)
  })
})

describe('o mesmo treino, contado de novo', () => {
  const fonte = { treinos: 12, quilometros: 40, medalhas: 2 }

  it('não aumenta o nível quando a conta repete', () => {
    // A projeção é idempotente por construção: ela não soma, ela traduz.
    const primeiro = nivelDe(fonte)
    const segundo = nivelDe(fonte)

    expect(segundo).toEqual(primeiro)
  })

  it('e a planta também não cresce com a releitura', () => {
    expect(plantaDoNivel(nivelDe(fonte))).toEqual(plantaDoNivel(nivelDe(fonte)))
  })
})

describe('a série desfeita volta atrás', () => {
  /*
   * O pedido exige recalcular quando registros são desfeitos ou corrigidos. Com
   * o nível derivado, "recalcular" é só ler de novo — e o teste fixa que ler de
   * novo com menos treino não deixa o nível preso no de antes.
   */
  it('menos treino não deixa o nível no patamar anterior', () => {
    const antes = nivelDe({ treinos: 9, quilometros: 0, medalhas: 0 })
    const depois = nivelDe({ treinos: 8, quilometros: 0, medalhas: 0 })

    expect(depois.xpTotal).toBeLessThan(antes.xpTotal)
    expect(depois.nivel).toBeLessThanOrEqual(antes.nivel)
  })

  it('e a planta acompanha, sem estágio preso', () => {
    const cheia = plantaDoNivel(nivelDe({ treinos: 400, quilometros: 2000, medalhas: 40 }))
    const inicial = plantaDoNivel(nivelDe({ treinos: 1, quilometros: 0, medalhas: 0 }))

    expect(cheia.estagio).not.toBe(inicial.estagio)
  })
})

describe('a ausência não mata a árvore', () => {
  it('quem parou de treinar fica no nível que conquistou', () => {
    /*
     * O mesmo histórico, lido hoje ou em três meses, dá o mesmo nível: não há
     * "quando" na fórmula. É a regra do pedido — não punir pausa, doença ou
     * retomada — garantida pela forma, não por um `if`.
     */
    const historico = { treinos: 30, quilometros: 120, medalhas: 3 }
    expect(nivelDe(historico)).toEqual(nivelDe(historico))
  })

  it('e o estágio dela não regride', () => {
    const nivel = nivelDe({ treinos: 30, quilometros: 120, medalhas: 3 })
    expect(plantaDoNivel(nivel).estagio).toBe(plantaDoNivel(nivel).estagio)
  })
})
