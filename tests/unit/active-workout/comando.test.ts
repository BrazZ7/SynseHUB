import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { criarComando, nomeDoCanal, perdiOComando } from '@/features/active-workout/storage/comando'

/**
 * Qual aba manda no treino — o aceite 13.
 *
 * O treino gravado no aparelho é um registro só por aluno, e duas abas abertas
 * leem e escrevem o mesmo registro. Cada mudança regrava o registro inteiro: a
 * última a escrever apaga o que a outra gravou, e a pessoa vê o treino voltar
 * no tempo sem ter desfeito nada.
 *
 * A política: manda quem abriu a tela; a outra para de gravar e oferece
 * retomar. A metade de dois **aparelhos** é do banco — 0059, a série que chega
 * de dois lugares.
 */

const DONO = 'matricula-1'
const MINHA = 'aba-1'

const anuncio = (aba: string, dono = DONO) => ({ tipo: 'assumi', dono, aba })

describe('o canal', () => {
  it('é um por dono', () => {
    // Duas contas no mesmo navegador não disputam comando: o treino de uma não
    // é o treino da outra, e o registro gravado também é separado.
    expect(nomeDoCanal('matricula-1')).not.toBe(nomeDoCanal('matricula-2'))
  })

  it('é estável para o mesmo dono', () => {
    expect(nomeDoCanal(DONO)).toBe(nomeDoCanal(DONO))
  })
})

describe('perder o comando', () => {
  it('outra aba assumiu: perde', () => {
    expect(perdiOComando(anuncio('aba-2'), DONO, MINHA)).toBe(true)
  })

  it('o próprio anúncio não tira o comando de quem o fez', () => {
    // Alguns navegadores devolvem a mensagem para quem a enviou. Sem esta
    // conferência, a aba se bloquearia sozinha ao abrir.
    expect(perdiOComando(anuncio(MINHA), DONO, MINHA)).toBe(false)
  })

  it('anúncio de outra conta não é meu assunto', () => {
    expect(perdiOComando(anuncio('aba-2', 'matricula-9'), DONO, MINHA)).toBe(false)
  })

  it('anúncio de formato desconhecido não bloqueia a tela', () => {
    /*
     * O que chega num canal é dado de fora do nosso controle: aba com versão
     * antiga do app, extensão, mensagem de outro recurso. Nada disso pode
     * travar a tela de quem está treinando — na dúvida, o comando fica onde
     * está.
     */
    expect(perdiOComando(null, DONO, MINHA)).toBe(false)
    expect(perdiOComando(undefined, DONO, MINHA)).toBe(false)
    expect(perdiOComando('assumi', DONO, MINHA)).toBe(false)
    expect(perdiOComando({}, DONO, MINHA)).toBe(false)
    expect(perdiOComando({ tipo: 'outra-coisa', dono: DONO, aba: 'aba-2' }, DONO, MINHA)).toBe(
      false,
    )
    expect(perdiOComando({ tipo: 'assumi', dono: DONO }, DONO, MINHA)).toBe(false)
    expect(perdiOComando({ tipo: 'assumi', aba: 'aba-2' }, DONO, MINHA)).toBe(false)
    expect(perdiOComando({ tipo: 'assumi', dono: DONO, aba: 7 }, DONO, MINHA)).toBe(false)
  })
})

describe('a aba sem comando', () => {
  const hook = readFileSync(
    join(process.cwd(), 'src/features/active-workout/use-active-workout.ts'),
    'utf8',
  )

  it('não grava o treino', () => {
    // A regra inteira existe por causa desta linha: duas abas gravando fazem a
    // última apagar o que a outra gravou.
    expect(hook).toMatch(/if \(comandoEmOutraAba\) return\n\s*if \(sessao/)
  })

  it('não sincroniza', () => {
    // A fila é compartilhada; quem manda drena. Duas abas drenando mandariam o
    // mesmo `client_id` duas vezes.
    expect(hook).toMatch(/if \(comandoRef\.current\) return/)
  })

  it('relê o treino gravado antes de assumir', () => {
    /*
     * A outra aba pode ter registrado séries depois de esta ter lido. Assumir
     * com a cópia velha na memória regravaria o registro para trás — o defeito
     * que a política existe para impedir, cometido pelo botão que deveria
     * resolvê-lo.
     */
    const assumir = hook.slice(hook.indexOf('const assumirComando'))
    expect(assumir.slice(0, 600)).toMatch(/await lerSessao\(dono\)/)
  })

  it('a tela diz o que está acontecendo e oferece a saída', () => {
    const tela = readFileSync(
      join(process.cwd(), 'src/features/active-workout/active-workout-screen.tsx'),
      'utf8',
    )
    expect(tela).toMatch(/treino\.comandoEmOutraAba/)
    expect(tela).toMatch(/Treinar nesta aba/)
  })
})

/**
 * `criarComando` com um `BroadcastChannel` de mentira.
 *
 * Ela nunca tinha sido testada porque `BroadcastChannel` não existe no Node, e
 * foi aí que o defeito se escondeu: o canal era criado uma vez e `fechar()` o
 * deixava inutilizável. Com `reactStrictMode`, o React monta o efeito,
 * desmonta e monta de novo — o desmonte fechava o canal e a segunda montagem
 * chamava `anunciar()` nele, com `InvalidStateError` derrubando a tela inteira
 * do Treino Ativo. Só em desenvolvimento, mas isso é todo dia de quem trabalha
 * no projeto.
 */
class CanalDeMentira {
  static abertos: CanalDeMentira[] = []
  fechado = false
  enviados: unknown[] = []
  onmessage: ((evento: { data: unknown }) => void) | null = null

  constructor(public readonly nome: string) {
    CanalDeMentira.abertos.push(this)
  }

  postMessage(dado: unknown) {
    // É o que o navegador faz: postar em canal fechado é erro, não silêncio.
    if (this.fechado) throw new Error('InvalidStateError: Channel is closed')
    this.enviados.push(dado)
  }

  close() {
    this.fechado = true
  }
}

describe('o ciclo de vida do canal', () => {
  function comCanalDeMentira<T>(corpo: () => T): T {
    const antes = (globalThis as Record<string, unknown>).BroadcastChannel
    CanalDeMentira.abertos = []
    ;(globalThis as Record<string, unknown>).BroadcastChannel = CanalDeMentira
    try {
      return corpo()
    } finally {
      ;(globalThis as Record<string, unknown>).BroadcastChannel = antes
    }
  }

  it('anuncia de novo depois de fechado, em vez de estourar', () => {
    comCanalDeMentira(() => {
      const comando = criarComando(DONO, MINHA)
      comando.ouvir(() => {})
      comando.anunciar()
      comando.fechar()

      // A segunda montagem do efeito, no StrictMode.
      expect(() => comando.anunciar()).not.toThrow()
      expect(CanalDeMentira.abertos).toHaveLength(2)
      expect(CanalDeMentira.abertos[1].enviados).toEqual([
        { tipo: 'assumi', dono: DONO, aba: MINHA },
      ])
    })
  })

  it('o ouvinte continua valendo no canal reaberto', () => {
    comCanalDeMentira(() => {
      let perdeu = false
      const comando = criarComando(DONO, MINHA)
      comando.ouvir(() => {
        perdeu = true
      })
      comando.fechar()
      comando.anunciar()

      // Outra aba assume, e quem registrou o ouvinte uma vez precisa saber.
      CanalDeMentira.abertos[1].onmessage?.({ data: anuncio('aba-2') })
      expect(perdeu).toBe(true)
    })
  })

  it('não abre canal nenhum antes de precisar', () => {
    comCanalDeMentira(() => {
      criarComando(DONO, MINHA)
      expect(CanalDeMentira.abertos).toHaveLength(0)
    })
  })

  it('sem `BroadcastChannel` no ambiente, não quebra', () => {
    // Webview antigo: não há aviso entre abas, e o comportamento é o de antes.
    const antes = (globalThis as Record<string, unknown>).BroadcastChannel
    delete (globalThis as Record<string, unknown>).BroadcastChannel
    try {
      const comando = criarComando(DONO, MINHA)
      expect(() => {
        comando.ouvir(() => {})
        comando.anunciar()
        comando.fechar()
      }).not.toThrow()
    } finally {
      ;(globalThis as Record<string, unknown>).BroadcastChannel = antes
    }
  })
})
