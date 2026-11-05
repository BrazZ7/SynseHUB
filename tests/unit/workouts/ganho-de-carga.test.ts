import { describe, expect, it } from 'vitest'

import { ganhoMaisTreinado, type RegistroDeCarga } from '@/features/workouts/ganho-de-carga'

/**
 * ── A regra do ganho de carga, caso a caso ──────────────────────────────────
 *
 * Estes testes existem porque a primeira versão da mudança deixou escapar uma
 * mutação: a regra vivia dentro do `DemoDataSource`, e os testes só
 * alcançavam os alunos que a semente produz. Todos têm vários dias do mesmo
 * exercício, então trocar "pelo menos dois dias" por "pelo menos um" passava
 * — e o caso do aluno novo é exatamente o que a tela precisa distinguir.
 *
 * Com a regra pura, cada caso é montado em três linhas.
 */

const r = (exerciseId: string, dia: string, load: number): RegistroDeCarga => ({
  exerciseId,
  performedAt: `${dia}T10:00:00Z`,
  load,
})

describe('ganhoMaisTreinado', () => {
  it('um dia só não é evolução', () => {
    /*
     * O caso do aluno novo. Devolver zero diria "você não evoluiu" para quem
     * acabou de começar, e a tela mostraria "+0,0 kg" como se fosse medida.
     */
    expect(ganhoMaisTreinado([r('supino', '2026-01-05', 40)])).toBeNull()
  })

  it('nenhum registro devolve nada', () => {
    expect(ganhoMaisTreinado([])).toBeNull()
  })

  it('vários dias do mesmo exercício dão a primeira e a última', () => {
    const ganho = ganhoMaisTreinado([
      r('supino', '2026-01-05', 40),
      r('supino', '2026-02-05', 50),
      r('supino', '2026-03-05', 62.5),
    ])

    expect(ganho).toEqual({ exerciseId: 'supino', primeira: 40, ultima: 62.5, dias: 3 })
  })

  it('não mistura exercícios — era o "+80 kg" da rosca para o agachamento', () => {
    /*
     * O defeito original, no menor caso que o reproduz: uma rosca de 20 kg e
     * um agachamento de 100 kg. A regra antiga devolvia +80; a nova não tem
     * dois dias de nenhum dos dois, então não devolve nada.
     */
    expect(
      ganhoMaisTreinado([r('rosca', '2026-01-05', 20), r('agachamento', '2026-01-06', 100)]),
    ).toBeNull()
  })

  it('escolhe o exercício com mais dias, não o de maior carga', () => {
    const ganho = ganhoMaisTreinado([
      r('agachamento', '2026-01-05', 100),
      r('agachamento', '2026-01-12', 110),
      r('supino', '2026-01-05', 40),
      r('supino', '2026-01-12', 45),
      r('supino', '2026-01-19', 50),
    ])

    expect(ganho?.exerciseId).toBe('supino')
    expect(ganho?.dias).toBe(3)
  })

  it('mais treinado conta dias, não séries', () => {
    // Seis séries de rosca num dia não são mais treino que dois dias de
    // supino. Contar linhas inverteria a escolha.
    const ganho = ganhoMaisTreinado([
      ...Array.from({ length: 6 }, () => r('rosca', '2026-01-05', 20)),
      r('rosca', '2026-01-06', 22),
      r('supino', '2026-01-05', 40),
      r('supino', '2026-01-12', 45),
      r('supino', '2026-01-19', 50),
    ])

    expect(ganho?.exerciseId).toBe('supino')
  })

  it('a carga do dia é a máxima do dia, não a primeira anotada', () => {
    /*
     * Numa sessão há aquecimento e série valendo. Pegar a primeira linha
     * faria o aquecimento de 20 kg virar "a carga do dia", e o ganho oscilar
     * com a ordem em que as séries foram digitadas.
     */
    const ganho = ganhoMaisTreinado([
      r('supino', '2026-01-05', 20),
      r('supino', '2026-01-05', 40),
      r('supino', '2026-01-05', 30),
      r('supino', '2026-02-05', 20),
      r('supino', '2026-02-05', 60),
    ])

    expect(ganho).toEqual({ exerciseId: 'supino', primeira: 40, ultima: 60, dias: 2 })
  })

  it('a hora não separa dias — duas sessões no mesmo dia são um dia', () => {
    const ganho = ganhoMaisTreinado([
      { exerciseId: 'supino', performedAt: '2026-01-05T07:00:00Z', load: 40 },
      { exerciseId: 'supino', performedAt: '2026-01-05T19:00:00Z', load: 45 },
    ])
    expect(ganho).toBeNull()
  })

  it('a ordem de chegada não muda o resultado', () => {
    // A lista pode vir em qualquer ordem do banco ou da demonstração.
    const registros = [
      r('supino', '2026-03-05', 62.5),
      r('supino', '2026-01-05', 40),
      r('supino', '2026-02-05', 50),
    ]
    const direto = ganhoMaisTreinado(registros)
    const invertido = ganhoMaisTreinado([...registros].reverse())

    expect(invertido).toEqual(direto)
    expect(direto?.primeira).toBe(40)
    expect(direto?.ultima).toBe(62.5)
  })

  it('empate no número de dias é decidido pelo id, não pela ordem', () => {
    /*
     * Sem desempate estável, a tela trocaria de exercício entre duas
     * aberturas sem nada ter mudado no treino da pessoa.
     */
    const a = ganhoMaisTreinado([
      r('aaa', '2026-01-05', 10),
      r('aaa', '2026-01-12', 12),
      r('zzz', '2026-01-05', 90),
      r('zzz', '2026-01-12', 95),
    ])
    const b = ganhoMaisTreinado([
      r('zzz', '2026-01-05', 90),
      r('zzz', '2026-01-12', 95),
      r('aaa', '2026-01-05', 10),
      r('aaa', '2026-01-12', 12),
    ])

    expect(a?.exerciseId).toBe('aaa')
    expect(b?.exerciseId).toBe('aaa')
  })

  it('queda de carga é ganho negativo, não zero', () => {
    // Quem reduziu a carga reduziu. Travar em zero esconderia uma lesão ou
    // uma deload — e a tela do professor precisa ver isso.
    const ganho = ganhoMaisTreinado([r('supino', '2026-01-05', 60), r('supino', '2026-02-05', 45)])

    expect(ganho!.ultima - ganho!.primeira).toBe(-15)
  })
})
