import { describe, expect, it } from 'vitest'

import type { WorkoutSession } from '@/features/active-workout/engine/types'
import {
  chaveDaSessao,
  donoValido,
  filaDoDono,
  sessaoDoDono,
} from '@/features/active-workout/storage/escopo'

/**
 * De quem é o treino gravado no aparelho.
 *
 * O defeito que estas regras fecham era real e silencioso: a sessão morava numa
 * chave fixa (`atual`) e a fila de envio era uma lista só, sem dono. No celular
 * do casal, no tablet da recepção, ou simplesmente depois de uma troca de
 * conta, quem abria o app depois recuperava o treino de quem abriu antes — com
 * nome do plano, exercícios e cargas — e a fila pendente subia pela sessão
 * autenticada de quem estava logado **naquele momento**.
 *
 * Como as actions não recebem aluno nenhum (o banco resolve pelo `auth.uid()`),
 * isso gravava as séries de uma pessoa no histórico da outra. Dado de saúde
 * atribuído à pessoa errada é pior que dado perdido, e é por isso que estes
 * testes existem antes de qualquer conveniência do treino.
 */

const sessaoFalsa = (planName: string): WorkoutSession =>
  ({
    clientId: 'local-1',
    serverId: null,
    workoutPlanId: null,
    planName,
    state: 'ACTIVE_SET',
    exercises: [],
    exerciseIndex: 0,
    setNumber: 1,
    currentReps: 10,
    currentWeight: 70,
    completedSets: [],
    startedAt: 0,
    setStartedAt: 0,
    restStartedAt: null,
    restEndsAt: null,
    pausedMs: 0,
    pausedAt: null,
    finishedAt: null,
    settings: {
      autoRest: true,
      sound: true,
      vibration: true,
      autoAdvance: false,
      keepScreenAwake: true,
      defaultRestSeconds: 90,
    },
  }) satisfies WorkoutSession

describe('a chave da sessão', () => {
  it('é uma por matrícula', () => {
    expect(chaveDaSessao('matricula-1')).not.toBe(chaveDaSessao('matricula-2'))
  })

  it('é estável: a mesma matrícula volta na mesma chave', () => {
    // Sem isto a recuperação não acha o treino de ninguém, e o app "esquece"
    // o treino no meio — defeito pior que o que o escopo resolve.
    expect(chaveDaSessao('matricula-1')).toBe(chaveDaSessao('matricula-1'))
  })

  it('não é a chave fixa de antes', () => {
    // Controle histórico: `atual` era a chave compartilhada por todo mundo.
    expect(chaveDaSessao('matricula-1')).not.toBe('atual')
  })
})

describe('dono válido', () => {
  it('matrícula é dono', () => {
    expect(donoValido('matricula-1')).toBe(true)
  })

  it('vazio não é dono', () => {
    /*
     * `''` como chave gravaria todo mundo no mesmo lugar outra vez, e em
     * silêncio. Quem chama trata isto não gravando nada: a tela segue em
     * memória, como já faz quando o IndexedDB não existe.
     */
    expect(donoValido('')).toBe(false)
    expect(donoValido('   ')).toBe(false)
  })

  it('ausente não é dono', () => {
    expect(donoValido(null)).toBe(false)
    expect(donoValido(undefined)).toBe(false)
  })
})

describe('a sessão guardada', () => {
  it('volta para quem a gravou', () => {
    const registro = { dono: 'matricula-1', sessao: sessaoFalsa('Treino A') }
    expect(sessaoDoDono(registro, 'matricula-1')?.planName).toBe('Treino A')
  })

  it('não volta para outra matrícula, mesmo lida da chave errada', () => {
    /*
     * A segunda tranca. A chave já separa; esta conferência é o que faz a
     * separação sobreviver a chave montada errada, a registro copiado entre
     * aparelhos e a migração futura que erre o formato.
     */
    const registro = { dono: 'matricula-1', sessao: sessaoFalsa('Treino A') }
    expect(sessaoDoDono(registro, 'matricula-2')).toBeNull()
  })

  it('sem registro, não há treino', () => {
    expect(sessaoDoDono(null, 'matricula-1')).toBeNull()
    expect(sessaoDoDono(undefined, 'matricula-1')).toBeNull()
  })

  it('dono vazio não abre nada', () => {
    const registro = { dono: '', sessao: sessaoFalsa('Treino A') }
    expect(sessaoDoDono(registro, '')).toBeNull()
  })
})

describe('a fila do dono', () => {
  const fila = [
    { clientId: 'a', dono: 'matricula-1' },
    { clientId: 'b', dono: 'matricula-2' },
    { clientId: 'c', dono: 'matricula-1' },
  ]

  it('traz só o que é da pessoa', () => {
    expect(filaDoDono(fila, 'matricula-1').map((o) => o.clientId)).toEqual(['a', 'c'])
  })

  it('não some com o que é de outra pessoa', () => {
    /*
     * Esta é a outra metade da regra, e ela é fácil de errar pelo lado
     * oposto: apagar o pendente alheio na troca de conta "resolveria" o
     * vazamento perdendo o treino de quem não está ali para reclamar. A fila
     * de origem continua inteira — filtrar é leitura, não limpeza.
     */
    filaDoDono(fila, 'matricula-1')
    expect(fila).toHaveLength(3)
  })

  it('matrícula sem nada na fila não recebe a de ninguém', () => {
    expect(filaDoDono(fila, 'matricula-3')).toEqual([])
  })

  it('dono vazio não recebe a fila inteira', () => {
    // O erro clássico do filtro frouxo: sem dono, devolver tudo.
    expect(filaDoDono(fila, '')).toEqual([])
  })
})
