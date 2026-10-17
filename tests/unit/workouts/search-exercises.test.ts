import { describe, expect, it } from 'vitest'

import { buscarExercicios, normalizar } from '@/features/workouts/search-exercises'
import type { Exercise } from '@/types/domain'

function exercicio(parcial: Partial<Exercise> & { name: string }): Exercise {
  return {
    id: parcial.name,
    organizationId: null,
    muscleGroup: 'LEGS',
    equipment: null,
    videoUrl: null,
    instructions: null,
    slug: null,
    primaryMuscle: null,
    synergists: [],
    region: null,
    movementPattern: null,
    mechanics: null,
    utility: null,
    equipmentType: null,
    unilateral: false,
    level: null,
    aliases: [],
    ...parcial,
  } as Exercise
}

/** O recorte da 0021 que interessa ao teste. */
const BIBLIOTECA: Exercise[] = [
  exercicio({
    name: 'Cadeira extensora',
    muscleGroup: 'LEGS',
    equipment: 'cadeira extensora',
    aliases: ['extensora', 'leg extension'],
    utility: 'AUXILIARY',
  }),
  exercicio({
    name: 'Agachamento livre',
    muscleGroup: 'LEGS',
    equipment: 'barra',
    aliases: ['squat'],
    utility: 'BASIC',
  }),
  exercicio({
    name: 'Supino reto com barra',
    muscleGroup: 'CHEST',
    equipment: 'barra',
    aliases: ['supino reto'],
    utility: 'BASIC',
  }),
  exercicio({
    name: 'Supino inclinado com halteres',
    muscleGroup: 'CHEST',
    equipment: 'halteres',
    aliases: [],
    utility: 'BASIC',
  }),
  exercicio({
    name: 'Crucifixo na máquina',
    muscleGroup: 'CHEST',
    equipment: 'voador',
    aliases: ['peck deck', 'voador'],
    utility: 'AUXILIARY',
  }),
  exercicio({
    name: 'Puxada frente',
    muscleGroup: 'BACK',
    equipment: 'pulley',
    aliases: ['pulley frente', 'puxada frontal', 'lat pulldown'],
    utility: 'BASIC',
  }),
  exercicio({
    name: 'Remada baixa',
    muscleGroup: 'BACK',
    equipment: 'polia baixa',
    aliases: ['cavalinho'],
    utility: 'BASIC',
  }),
  exercicio({
    name: 'Rosca direta',
    muscleGroup: 'ARMS',
    equipment: 'barra',
    aliases: [],
    utility: 'BASIC',
    primaryMuscle: 'BICEPS',
  }),
]

const nomes = (termo: string) => buscarExercicios(BIBLIOTECA, termo).map((e) => e.name)

describe('normalizar', () => {
  it('derruba acento e caixa', () => {
    expect(normalizar('Abdução')).toBe('abducao')
    expect(normalizar('  Bíceps  ')).toBe('biceps')
    expect(normalizar('MÁQUINA')).toBe('maquina')
  })
})

describe('buscarExercicios', () => {
  it('acha a cadeira extensora — o caso que motivou tudo isto', () => {
    expect(nomes('cadeira extensora')).toContain('Cadeira extensora')
    expect(nomes('extensora')).toContain('Cadeira extensora')
    // O apelido gringo, que a 0021 gravou e nenhuma tela usava.
    expect(nomes('leg extension')).toEqual(['Cadeira extensora'])
  })

  it('acha pelo apelido regional', () => {
    // Os três exemplos que a própria migration cita como motivo de existir.
    expect(nomes('pulley frente')).toContain('Puxada frente')
    expect(nomes('cavalinho')).toEqual(['Remada baixa'])
    expect(nomes('peck deck')).toEqual(['Crucifixo na máquina'])
  })

  it('ignora acento nos dois sentidos', () => {
    expect(nomes('maquina')).toContain('Crucifixo na máquina')
    expect(nomes('biceps')).toContain('Rosca direta')
  })

  it('casa palavra por palavra, sem exigir a frase inteira', () => {
    expect(nomes('supino incl')).toEqual(['Supino inclinado com halteres'])
    // Palavras em campos diferentes: "extensora" no nome, "leg" no apelido.
    expect(nomes('extensora leg')).toEqual(['Cadeira extensora'])
  })

  it('põe quem casa no nome antes de quem casa por tabela', () => {
    const resultado = nomes('supino')
    // Os dois supinos primeiro. Entre eles vale o alfabético, porque empatam
    // na nota e na utilidade — e inventar um critério aqui seria fingir que o
    // código sabe qual dos dois a pessoa quis.
    expect(resultado.slice(0, 2).sort()).toEqual([
      'Supino inclinado com halteres',
      'Supino reto com barra',
    ])
    // E só eles: "supino" não está no nome, no apelido, no aparelho nem no
    // músculo do crucifixo, então ele não entra. Buscar exercício não é
    // sugerir exercício parecido.
    expect(resultado).toHaveLength(2)
  })

  it('desempata pelo básico antes do auxiliar', () => {
    // Os dois são de peito e nenhum casa no nome — decide a utilidade.
    const resultado = nomes('peito')
    expect(resultado.indexOf('Supino reto com barra')).toBeLessThan(
      resultado.indexOf('Crucifixo na máquina'),
    )
  })

  it('busca por músculo, que é o que o professor tenta primeiro', () => {
    expect(nomes('costas')).toEqual(expect.arrayContaining(['Puxada frente', 'Remada baixa']))
    expect(nomes('peito')).toEqual(
      expect.arrayContaining(['Supino reto com barra', 'Crucifixo na máquina']),
    )
  })

  it('busca pelo aparelho como se fala na academia', () => {
    expect(nomes('voador')).toContain('Crucifixo na máquina')
    expect(nomes('halteres')).toEqual(['Supino inclinado com halteres'])
  })

  it('devolve vazio para termo vazio, e não a biblioteca inteira', () => {
    // Quem não digitou nada vê a lista agrupada, que é melhor para escolher.
    expect(buscarExercicios(BIBLIOTECA, '')).toEqual([])
    expect(buscarExercicios(BIBLIOTECA, '   ')).toEqual([])
  })

  it('devolve vazio quando não há o que achar, sem cair em tudo', () => {
    expect(nomes('xilofone')).toEqual([])
    // Uma palavra casa, a outra não: o resultado é vazio, não o parcial.
    expect(nomes('supino xilofone')).toEqual([])
  })

  it('respeita o limite', () => {
    expect(buscarExercicios(BIBLIOTECA, 'a', 2)).toHaveLength(2)
  })
})
