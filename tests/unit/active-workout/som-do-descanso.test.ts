import { afterEach, describe, expect, it } from 'vitest'

import { WebFeedback } from '@/features/active-workout/platform/web-adapter'

/**
 * ── O aviso sonoro do fim do descanso ───────────────────────────────────────
 *
 * A preferência "Som" existia na 0026 e **nada a lia**: era um campo gravado no
 * banco sem efeito nenhum. Ligar o painel de ajustes sem implementar o som
 * teria posto na tela um interruptor que não faz nada — pior que não ter.
 *
 * ── A armadilha que estes testes guardam ────────────────────────────────────
 *
 * Navegador só toca áudio depois de um gesto da pessoa. O fim do descanso não
 * é gesto: é um temporizador vencendo. Criar o `AudioContext` ali devolve um
 * contexto `suspended`, e o `start()` do oscilador **não lança** — simplesmente
 * não sai som. O defeito seria invisível no código e óbvio no corredor da
 * academia.
 *
 * Daí as duas funções: `prepararSom` abre o canal dentro do toque, `beep` só
 * usa o que já está aberto. Quem um dia fundir as duas quebra estes testes.
 */

/** Um `AudioContext` de mentira que registra o que foi pedido dele. */
class ContextoFalso {
  state: 'suspended' | 'running' | 'closed' = 'suspended'
  currentTime = 10
  destination = { nome: 'saida' }
  osciladores: { hz: number; inicio: number; fim: number }[] = []
  resumeNegado = false

  async resume() {
    if (this.resumeNegado) throw new Error('gesto ausente')
    this.state = 'running'
  }

  createOscillator() {
    const registro = { hz: 0, inicio: -1, fim: -1 }
    this.osciladores.push(registro)
    return {
      type: 'sine',
      frequency: {
        set value(hz: number) {
          registro.hz = hz
        },
        get value() {
          return registro.hz
        },
      },
      connect: (destino: unknown) => destino,
      start: (quando: number) => {
        registro.inicio = quando
      },
      stop: (quando: number) => {
        registro.fim = quando
      },
    }
  }

  createGain() {
    return {
      gain: {
        setValueAtTime: () => {},
        exponentialRampToValueAtTime: () => {},
      },
      connect: (destino: unknown) => destino,
    }
  }
}

let criados: ContextoFalso[] = []

function comAudio(disponivel = true) {
  criados = []
  const Fake = function () {
    const ctx = new ContextoFalso()
    criados.push(ctx)
    return ctx
  } as unknown as typeof AudioContext

  Object.defineProperty(globalThis, 'window', {
    value: disponivel ? { AudioContext: Fake } : {},
    configurable: true,
    writable: true,
  })
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window')
})

describe('o som do fim do descanso', () => {
  it('não toca nada antes de alguém ter tocado na tela', async () => {
    comAudio()
    const feedback = new WebFeedback()

    feedback.beep()

    expect(criados).toHaveLength(0)
  })

  it('depois do gesto, toca os dois tons em instantes diferentes', async () => {
    comAudio()
    const feedback = new WebFeedback()

    await feedback.prepararSom()
    feedback.beep()

    const [ctx] = criados
    expect(ctx.state).toBe('running')
    expect(ctx.osciladores).toHaveLength(2)
    // Sobem: o segundo tom é mais agudo que o primeiro, e vem depois.
    expect(ctx.osciladores[1].hz).toBeGreaterThan(ctx.osciladores[0].hz)
    expect(ctx.osciladores[1].inicio).toBeGreaterThan(ctx.osciladores[0].inicio)
    // E param: oscilador sem `stop` fica zumbindo até a aba fechar.
    for (const o of ctx.osciladores) expect(o.fim).toBeGreaterThan(o.inicio)
  })

  it('o canal é um só: preparar duas vezes não cria outro contexto', async () => {
    comAudio()
    const feedback = new WebFeedback()

    await feedback.prepararSom()
    await feedback.prepararSom()

    expect(criados).toHaveLength(1)
  })

  it('contexto que o navegador recusa retomar não vira som nem erro', async () => {
    comAudio()
    const feedback = new WebFeedback()

    await feedback.prepararSom()
    criados[0].state = 'suspended' // o iOS faz isto ao voltar do segundo plano
    expect(() => feedback.beep()).not.toThrow()
    expect(criados[0].osciladores).toHaveLength(0)
  })

  it('ambiente sem Web Audio segue em frente, calado', async () => {
    comAudio(false)
    const feedback = new WebFeedback()

    await expect(feedback.prepararSom()).resolves.toBeUndefined()
    expect(() => feedback.beep()).not.toThrow()
  })
})
