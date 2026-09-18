import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { calcularNivel } from '@/features/students/level'
import { ESTAGIOS, NIVEL_DA_ARVORE, estagioDoNivel, plantaDoNivel } from '@/features/students/plant'

/**
 * A planta do perfil.
 *
 * Ela é a tradução visual do nível, e o que estes testes protegem é que a
 * tradução não minta: nunca encolher quando o nível sobe, nunca prometer um
 * próximo estágio que não existe, e nunca desenhar um painel apagado para
 * quem acabou de chegar.
 */

const nivelCru = (nivel: number, progresso = 0) => ({
  nivel,
  xpNoNivel: 0,
  xpDoNivel: 1000,
  falta: 1000,
  progresso,
  xpTotal: 0,
})

describe('os estágios', () => {
  it('começa na semente e termina na árvore', () => {
    expect(estagioDoNivel(1).chave).toBe('SEMENTE')
    expect(estagioDoNivel(NIVEL_DA_ARVORE).chave).toBe('ARVORE')
  })

  it('cada faixa começa onde a anterior acaba, sem buraco nem sobreposição', () => {
    for (let i = 1; i < ESTAGIOS.length; i += 1) {
      const anterior = ESTAGIOS[i - 1]!
      const atual = ESTAGIOS[i]!
      expect(atual.nivelMinimo).toBeGreaterThan(anterior.nivelMinimo)
      expect(estagioDoNivel(atual.nivelMinimo - 1).chave).toBe(anterior.chave)
      expect(estagioDoNivel(atual.nivelMinimo).chave).toBe(atual.chave)
    }
  })

  /*
   * Cada estágio aponta para um arquivo em `public/`. Um nome errado não
   * quebra build nem tipo: a tela carrega e a planta simplesmente não aparece,
   * e isso só se descobre olhando o aparelho. Aqui descobre-se em 2ms.
   */
  it('toda arte declarada existe em public/', () => {
    for (const estagio of ESTAGIOS) {
      const caminho = join(process.cwd(), 'public', estagio.arte.src)
      expect(existsSync(caminho), `${estagio.chave} aponta para ${estagio.arte.src}`).toBe(true)
    }
  })

  it('nível absurdo ou inválido não sai da lista', () => {
    expect(estagioDoNivel(0).chave).toBe('SEMENTE')
    expect(estagioDoNivel(-40).chave).toBe('SEMENTE')
    expect(estagioDoNivel(500).chave).toBe('ARVORE')
  })
})

describe('a planta', () => {
  it('nasce viva: o nível 1 já brilha, mesmo sendo pequena', () => {
    const inicio = plantaDoNivel(nivelCru(1))
    expect(inicio.vigor).toBeGreaterThan(0.4)
    // Pequena de verdade: a árvore precisa ter para onde crescer.
    expect(inicio.crescimento).toBe(0)
  })

  it('o tamanho vai de zero a um, do primeiro nível até a árvore', () => {
    expect(plantaDoNivel(nivelCru(NIVEL_DA_ARVORE)).crescimento).toBe(1)
    expect(plantaDoNivel(nivelCru(500)).crescimento).toBe(1)
    // Nível inválido não empurra o tamanho para fora da faixa.
    expect(plantaDoNivel(nivelCru(-3)).crescimento).toBe(0)
  })

  it('nunca encolhe quando o nível sobe', () => {
    let vigorAnterior = -1
    let tamanhoAnterior = -1
    for (let nivel = 1; nivel <= 60; nivel += 1) {
      const { vigor, crescimento } = plantaDoNivel(nivelCru(nivel))
      expect(vigor).toBeGreaterThanOrEqual(vigorAnterior)
      expect(crescimento).toBeGreaterThanOrEqual(tamanhoAnterior)
      vigorAnterior = vigor
      tamanhoAnterior = crescimento
    }
  })

  it('anda dentro do nível, e não só na virada', () => {
    const comeco = plantaDoNivel(nivelCru(3, 0))
    const fim = plantaDoNivel(nivelCru(3, 0.9))
    expect(fim.vigor).toBeGreaterThan(comeco.vigor)
    expect(fim.crescimento).toBeGreaterThan(comeco.crescimento)
    expect(fim.progresso).toBeGreaterThan(comeco.progresso)
  })

  it('o vigor satura em 1 e fica lá', () => {
    expect(plantaDoNivel(nivelCru(NIVEL_DA_ARVORE)).vigor).toBeCloseTo(1)
    expect(plantaDoNivel(nivelCru(500)).vigor).toBeCloseTo(1)
  })

  it('a árvore não promete um próximo estágio', () => {
    const arvore = plantaDoNivel(nivelCru(NIVEL_DA_ARVORE))
    expect(arvore.proximo).toBeNull()
    expect(arvore.niveisParaOProximo).toBe(0)
    expect(arvore.progresso).toBe(1)
  })

  it('conta os níveis que faltam para o próximo estágio', () => {
    const semente = plantaDoNivel(nivelCru(1))
    expect(semente.proximo?.chave).toBe('BROTO')
    expect(semente.niveisParaOProximo).toBe(1)

    const muda = plantaDoNivel(nivelCru(4))
    expect(muda.proximo?.chave).toBe('ARBUSTO')
    expect(muda.niveisParaOProximo).toBe(3)
  })

  it('o progresso do estágio fica entre 0 e 1 em qualquer nível', () => {
    for (let nivel = 1; nivel <= 80; nivel += 1) {
      for (const fracao of [0, 0.5, 1]) {
        const { progresso } = plantaDoNivel(nivelCru(nivel, fracao))
        expect(progresso).toBeGreaterThanOrEqual(0)
        expect(progresso).toBeLessThanOrEqual(1)
      }
    }
  })

  it('combina com o nível que sai do histórico de verdade', () => {
    // Uma pessoa com nove treinos passa do nível 1 e vira broto.
    const nove = calcularNivel(9 * 100)
    expect(nove.nivel).toBe(2)
    expect(plantaDoNivel(nove).estagio.chave).toBe('BROTO')
  })
})
