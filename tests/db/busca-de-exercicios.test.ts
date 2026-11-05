import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buscarExercicios } from '@/features/workouts/search-exercises'
import type { Exercise } from '@/types/domain'

import { applyMigrations, connect, databaseAvailable } from './helpers'

/**
 * A busca contra o catálogo de verdade.
 *
 * `tests/unit/workouts/search-exercises.test.ts` prova a lógica sobre oito
 * exercícios inventados. Este prova sobre os 132 que a 0021 realmente insere —
 * que é onde moram os apelidos, e onde o defeito original aconteceu.
 *
 * A diferença não é teórica: no dataset de demonstração os exercícios entram
 * com `aliases: []`, e medindo no navegador a busca por "cavalinho" voltou
 * vazia. Não era erro da busca; era o dataset. Contra o catálogo real ela acha.
 */

let client: Client
const temBanco = await databaseAvailable()
let catalogo: Exercise[] = []

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)

  const { rows } = await client.query(`
    select id, organization_id, name, muscle_group, equipment, primary_muscle,
           utility, aliases
      from exercises
     where organization_id is null
  `)

  catalogo = rows.map((linha) => ({
    id: linha.id,
    organizationId: linha.organization_id,
    name: linha.name,
    muscleGroup: linha.muscle_group,
    equipment: linha.equipment,
    primaryMuscle: linha.primary_muscle,
    utility: linha.utility,
    aliases: linha.aliases ?? [],
  })) as Exercise[]
}, 60_000)

afterAll(async () => {
  await client?.end()
})

const nomes = (termo: string) => buscarExercicios(catalogo, termo, 50).map((e) => e.name)

describe.skipIf(!temBanco)('busca sobre o catálogo da 0021', () => {
  it('a 0021 entrega os 132 exercícios da plataforma', () => {
    // Se este número mudar, alguém mexeu no catálogo — e os testes abaixo
    // falam de exercícios concretos que podem ter saído junto.
    expect(catalogo.length).toBe(132)
  })

  it('acha a cadeira extensora pelos três caminhos', () => {
    // O caso que o dono do produto tentou e não achou.
    expect(nomes('cadeira extensora')).toContain('Cadeira extensora')
    expect(nomes('extensora')).toContain('Cadeira extensora')
    expect(nomes('leg extension')).toContain('Cadeira extensora')
  })

  it('acha pelos apelidos que a própria migration cita como motivo', () => {
    /*
     * A 0021 escreveu: "puxada frontal é pulley frente, voador é peck deck,
     * remada baixa é cavalinho, serrote é remada unilateral". São estes.
     */
    for (const [apelido, esperado] of [
      ['pulley frente', 'Puxada'],
      ['peck deck', 'oador'],
      ['cavalinho', 'Remada'],
      ['serrote', 'Remada'],
    ] as const) {
      const achados = nomes(apelido)
      expect(achados.length, `"${apelido}" não achou nada`).toBeGreaterThan(0)
      expect(achados.some((nome) => nome.includes(esperado)), `"${apelido}" → ${achados[0]}`).toBe(
        true,
      )
    }
  })

  it('acha sem acento o que está escrito com acento', () => {
    const comAcento = catalogo.filter((e) => /[áàâãéêíóôõúç]/i.test(e.name))
    expect(comAcento.length, 'o catálogo deixou de ter nome acentuado').toBeGreaterThan(0)

    for (const exercicio of comAcento.slice(0, 5)) {
      const semAcento = exercicio.name
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
      expect(nomes(semAcento), `digitando "${semAcento}"`).toContain(exercicio.name)
    }
  })

  it('busca por músculo devolve um punhado, e não a biblioteca', () => {
    const peito = nomes('peito')
    expect(peito.length).toBeGreaterThan(3)
    expect(peito.length).toBeLessThan(catalogo.length)
  })

  it('não devolve tudo para uma letra solta', () => {
    // Com limite, "a" casa em quase todo nome — o teto é o que impede a lista
    // de voltar a ser as 132 linhas que a busca veio resolver.
    expect(buscarExercicios(catalogo, 'a', 30).length).toBeLessThanOrEqual(30)
  })

  it('todo exercício do catálogo é achável pelo próprio nome', () => {
    // O teste que pega regressão boba: um normalizador que engula hífen, ou
    // uma nota que descarte quem não tem apelido.
    const perdidos = catalogo.filter((exercicio) => !nomes(exercicio.name).includes(exercicio.name))
    expect(perdidos.map((e) => e.name)).toEqual([])
  })
})
