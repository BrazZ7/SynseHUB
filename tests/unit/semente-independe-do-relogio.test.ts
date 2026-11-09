import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * A semente da demonstração não pode depender da hora do dia.
 *
 * ── O defeito ───────────────────────────────────────────────────────────────
 *
 * O laço de check-ins calcula quantos registros criar para o dia corrente a
 * partir de `elapsedDayFraction(DEMO_NOW)`, que depende da **hora**. Ele
 * sorteava do mesmo gerador que todo o resto, então o número de sorteios
 * consumidos mudava ao longo do dia — e com ele a sequência de tudo que é
 * semeado depois.
 *
 * Medido: dois testes do CRM falharam às 13h41 e passaram às 14h15, sem
 * ninguém tocar no código. Eles afirmam coisas sobre os leads, semeados depois
 * dos check-ins. Teste que muda de resultado sozinho não protege nada, e ainda
 * ensina a ignorar vermelho.
 *
 * ── O que este arquivo trava ────────────────────────────────────────────────
 *
 * Que a mesma data, em horas diferentes, produza os mesmos dados em tudo que
 * não é check-in. Os check-ins **devem** variar: é a única coisa aqui que o
 * relógio legitimamente muda, porque não se inventa presença no futuro.
 */

/**
 * Semeia como se fosse aquela hora do dia 15/10/2026.
 *
 * O dataset é guardado num símbolo global (`Symbol.for('synse.demo.dataset')`),
 * de propósito: o módulo é carregado mais de uma vez no servidor e um cache de
 * módulo não seria compartilhado. Aqui isso precisa ser desfeito entre as
 * chamadas, senão a segunda hora devolveria o dataset da primeira e o teste
 * passaria sem testar nada.
 */
async function semearAs(hora: number, minuto = 0) {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 15, hora, minuto, 0))
  const escopo = globalThis as Record<symbol, unknown>
  delete escopo[Symbol.for('synse.demo.dataset')]
  vi.resetModules()
  const modulo = await import('@/lib/database/demo-seed')
  return modulo.getDemoDataset()
}

afterEach(() => {
  vi.useRealTimers()
  vi.resetModules()
})

describe('a semente em horas diferentes do mesmo dia', () => {
  /**
   * O retorno de um lead é semeado como "tantos dias a partir de agora", então
   * o carimbo absoluto **deve** mudar com a hora — comparar o ISO cru acusaria
   * um defeito que não existe. O que precisa ser estável é o deslocamento: é
   * ele que decide se o retorno está vencido, e era ele que oscilava.
   */
  const assinaturaDosLeads = (dataset: Awaited<ReturnType<typeof semearAs>>, agora: Date) =>
    dataset.leads.map((l) => {
      const dias =
        l.nextFollowUpAt == null
          ? 'sem-retorno'
          : Math.round((Date.parse(l.nextFollowUpAt) - agora.getTime()) / 86_400_000)
      return `${l.id}|${l.stage}|${dias}`
    })

  it('produz os mesmos leads, com o mesmo retorno em dias', async () => {
    // Era isto que oscilava, e o que derrubava os testes do CRM.
    const cedo = assinaturaDosLeads(await semearAs(7, 30), new Date(2026, 9, 15, 7, 30))
    const tarde = assinaturaDosLeads(await semearAs(21, 45), new Date(2026, 9, 15, 21, 45))

    expect(tarde).toEqual(cedo)
  })

  it('produz os mesmos alunos, planos e cobranças', async () => {
    const manha = await semearAs(7, 30)
    const noite = await semearAs(21, 45)

    expect(noite.students.map((s) => `${s.id}|${s.status}|${s.synseId}`)).toEqual(
      manha.students.map((s) => `${s.id}|${s.status}|${s.synseId}`),
    )
    expect(noite.charges.map((c) => `${c.id}|${c.status}|${c.amount}`)).toEqual(
      manha.charges.map((c) => `${c.id}|${c.status}|${c.amount}`),
    )
  })

  it('produz as mesmas corridas', async () => {
    const manha = await semearAs(7, 30)
    const noite = await semearAs(21, 45)

    expect(noite.activities.map((a) => `${a.id}|${a.distanceMeters}`)).toEqual(
      manha.activities.map((a) => `${a.id}|${a.distanceMeters}`),
    )
  })

  it('mas os check-ins de hoje crescem com o dia, que é o certo', async () => {
    /*
     * O controle. Se isto passasse a ser igual, o desacoplamento teria sido
     * feito do jeito errado — congelando a única coisa que o relógio deve
     * mudar, em vez de isolar o gerador dela.
     */
    const manha = await semearAs(6, 0)
    const noite = await semearAs(22, 30)

    expect(noite.checkIns.length).toBeGreaterThan(manha.checkIns.length)
  })
})
