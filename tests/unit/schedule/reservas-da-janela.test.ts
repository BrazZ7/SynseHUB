import { describe, expect, it } from 'vitest'

import { clienteFalso } from '../postgrest-falso'

/**
 * ── As reservas do aluno são as da janela ───────────────────────────────────
 *
 * `listClassSessionsForStudent` lia as aulas da semana — recortadas pela
 * janela, tudo certo — e, ao lado, **toda** reserva da academia com situação
 * reservada, em espera ou presente. Sem teto e sem recorte de data.
 *
 * Uma academia com três anos de aulas acumula dezenas de milhares de
 * `ATTENDED`, e isso era lido na **tela inicial do aluno**, a cada abertura do
 * app. Quando o PostgREST cortasse, o sintoma não seria erro: seria a reserva
 * do aluno sumindo do cartão da próxima aula, ou a posição na fila de espera
 * vindo errada — porque as linhas que sobrariam seriam as mais antigas.
 *
 * Os dois usos só olham as aulas desta janela. É isso que estes testes travam.
 */

const sessao = (id: string) => ({
  id,
  organization_id: 'org_1',
  class_schedule_id: 'sch_1',
  starts_at: '2026-10-12T08:00:00Z',
  ends_at: '2026-10-12T09:00:00Z',
  status: 'SCHEDULED',
  capacity: 10,
})

const janela = { from: '2026-10-11T00:00:00Z', to: '2026-10-18T00:00:00Z' }

function chamadaDeReservas(
  chamadas: { nome: string; passos: { metodo: string; args: unknown[] }[] }[],
) {
  return chamadas.filter((c) => c.nome === 'class_bookings')
}

describe('a leitura de reservas', () => {
  it('é recortada pelas aulas da janela, e não pela academia', async () => {
    const { dataSource, chamadas } = clienteFalso({
      tabelas: {
        class_sessions: [{ data: [sessao('ses_1'), sessao('ses_2')], error: null }],
        class_bookings: [{ data: [], error: null }],
      },
    })

    await dataSource.listClassSessionsForStudent('org_1', 'aluno_1', janela)

    const [reservas] = chamadaDeReservas(chamadas)
    const recorte = reservas.passos.find((p) => p.metodo === 'in' && p.args[0] === 'session_id')
    expect(recorte?.args[1]).toEqual(['ses_1', 'ses_2'])
  })

  it('não vai ao banco quando a janela não tem aula nenhuma', async () => {
    /*
     * `in` com lista vazia é uma ida à rede para receber nada — e numa
     * academia que ainda não publicou a grade, essa é a situação normal.
     */
    const { dataSource, chamadas } = clienteFalso({
      tabelas: { class_sessions: [{ data: [], error: null }] },
    })

    const resultado = await dataSource.listClassSessionsForStudent('org_1', 'aluno_1', janela)

    expect(resultado).toEqual([])
    expect(chamadaDeReservas(chamadas)).toHaveLength(0)
  })

  it('continua devolvendo a minha reserva e a posição na fila', async () => {
    // O recorte não pode custar o que a tela mostra.
    const reserva = (id: string, aluno: string, status: string, quando: string) => ({
      id,
      session_id: 'ses_1',
      student_id: aluno,
      status,
      created_at: quando,
    })

    const { dataSource } = clienteFalso({
      tabelas: {
        class_sessions: [{ data: [sessao('ses_1')], error: null }],
        class_bookings: [
          {
            data: [
              reserva('b1', 'outro', 'WAITLIST', '2026-10-10T10:00:00Z'),
              reserva('b2', 'aluno_1', 'WAITLIST', '2026-10-10T11:00:00Z'),
            ],
            error: null,
          },
        ],
      },
    })

    const [aula] = await dataSource.listClassSessionsForStudent('org_1', 'aluno_1', janela)

    expect(aula.myBookingId).toBe('b2')
    expect(aula.myBookingStatus).toBe('WAITLIST')
    // Segunda da fila: uma espera entrou antes.
    expect(aula.waitlistPosition).toBe(2)
  })

  it('pede as três situações que a tela usa, e só elas', async () => {
    const { dataSource, chamadas } = clienteFalso({
      tabelas: {
        class_sessions: [{ data: [sessao('ses_1')], error: null }],
        class_bookings: [{ data: [], error: null }],
      },
    })

    await dataSource.listClassSessionsForStudent('org_1', 'aluno_1', janela)

    const [reservas] = chamadaDeReservas(chamadas)
    const situacoes = reservas.passos.find((p) => p.metodo === 'in' && p.args[0] === 'status')
    expect(situacoes?.args[1]).toEqual(['BOOKED', 'WAITLIST', 'ATTENDED'])
  })
})
