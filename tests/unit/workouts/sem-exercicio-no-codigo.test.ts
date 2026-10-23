import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { globSync } from 'glob'
import { describe, expect, it } from 'vitest'

import { RAIZ, semComentarios } from '../grafo-de-importacoes'

/**
 * ── Nenhum nome de exercício escrito na tela ────────────────────────────────
 *
 * "Supino reto" esteve escrito no código em **três** lugares: a legenda do
 * cartão "Carga atual", a do "Ganho de carga" e a do gráfico "Evolução de
 * carga" da ficha do hub. Os três números vinham de **qualquer** exercício.
 *
 * O defeito durou porque era invisível onde se olha: a semente da
 * demonstração registra todo treino no supino, então a legenda fixa era
 * verdade na demonstração e mentira em qualquer academia real. Dois dos três
 * já tinham sido consertados numa passagem anterior, e o terceiro sobreviveu
 * — é o tipo de coisa que só um guarda pega.
 *
 * Nome de exercício é dado do catálogo: vem do banco, com o id ao lado.
 * Escrever um na tela é afirmar sobre o treino de alguém sem ter lido o
 * treino de ninguém.
 *
 * O guarda olha `src/app` e `src/features`, que é onde tela mora. O catálogo
 * (`lib/baseline`, `db/migrations`) e a semente citam nomes de exercício
 * porque é exatamente o trabalho deles.
 */

/** Do catálogo da 0021 — os mais prováveis de alguém escrever à mão. */
const NOMES = [
  'Supino reto',
  'Supino inclinado',
  'Agachamento livre',
  'Rosca direta',
  'Leg press',
  'Puxada frontal',
  'Remada baixa',
  'Cadeira extensora',
]

function arquivosDeTela(): string[] {
  return globSync(['src/app/**/*.{ts,tsx}', 'src/features/**/*.{ts,tsx}'], { cwd: RAIZ })
}

describe('nome de exercício não é escrito na tela', () => {
  it('o guarda enxerga arquivos — o controle', () => {
    // Sem isto, um glob que não casasse nada faria a asserção abaixo passar
    // por omissão, que é o modo mais comum de um guarda virar decoração.
    expect(arquivosDeTela().length).toBeGreaterThan(100)
  })

  it('nenhuma tela cita um exercício do catálogo', () => {
    const achados: string[] = []

    for (const arquivo of arquivosDeTela()) {
      /*
       * Comentário pode citar: é onde a história deste defeito está escrita,
       * e apagá-la de lá seria perder o motivo. O que não pode é o nome
       * chegar à tela.
       */
      const codigo = semComentarios(readFileSync(join(RAIZ, arquivo), 'utf8'))
      for (const nome of NOMES) {
        if (codigo.includes(nome)) achados.push(`${arquivo}: "${nome}"`)
      }
    }

    expect(
      achados,
      'nome de exercício escrito na tela: ele vem do banco, com o id ao lado',
    ).toEqual([])
  })

  it('e pega um nome escrito de verdade — o segundo controle', () => {
    // O guarda tem de enxergar fora de comentário e ignorar dentro.
    expect(semComentarios('const c = "Supino reto — por semana."')).toContain('Supino reto')
    expect(semComentarios('/* vinha de "Supino reto" fixo */')).not.toContain('Supino reto')
  })
})
