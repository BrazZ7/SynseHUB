import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * ── O oráculo de contas ──────────────────────────────────────────────────────
 *
 * `requestFriendshipAction` responde uma pergunta que nenhuma outra tela
 * responde: "este Synse ID existe?". Acertar devolve "Pedido enviado"; errar
 * devolve "Não encontramos ninguém com esse Synse ID".
 *
 * Adivinhar às cegas é impraticável — 32 símbolos em 8 posições. O caso que
 * importa é quem **já tem uma lista** de ids e quer saber quais viraram conta
 * no Synse. Sem limite, isso custa uma tarde de script.
 *
 * Esta ação foi a única sensível que entrou sem limite, entre catorze que já
 * tinham. Encontrada numa revisão da própria sessão que a escreveu, não por
 * teste vermelho.
 */

const requestFriendship = vi.fn()

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

let perfil = 'prof-1'
vi.mock('@/lib/auth/require-session', () => ({
  requireStudentSession: async () => ({
    organizationId: 'org-1',
    studentId: 'stu-1',
    get userProfileId() {
      return perfil
    },
  }),
}))

vi.mock('@/lib/database', () => ({ getDataSource: async () => ({ requestFriendship }) }))

const { requestFriendshipAction } = await import('@/features/friends/actions')

function pedir(synseId: string) {
  const dados = new FormData()
  dados.set('synseId', synseId)
  return requestFriendshipAction({}, dados)
}

/** Ids bem formados e diferentes: SYN- + 8 do alfabeto sem ambíguos. */
let n = 0
const umId = () => `SYN-${String(n++).padStart(8, 'A').slice(-8).replace(/[0-9]/g, (d) => 'ABCDEFGHJK'[Number(d)])}`

let contaDePerfil = 0
beforeEach(() => {
  requestFriendship.mockReset().mockResolvedValue('amizade-1')
  // Perfil novo por teste: o limite é por conta, e um teste não pode gastar a
  // cota do seguinte.
  perfil = `prof-${(contaDePerfil += 1)}`
})

describe('limite de pedidos de amizade', () => {
  it('deixa passar o uso normal', async () => {
    for (let i = 0; i < 10; i += 1) {
      const r = await pedir(umId())
      expect(r.ok, `pedido ${i + 1}`).toBeTruthy()
    }
    expect(requestFriendship).toHaveBeenCalledTimes(10)
  })

  it('barra o décimo primeiro seguido', async () => {
    for (let i = 0; i < 10; i += 1) await pedir(umId())

    const r = await pedir(umId())
    expect(r.error).toMatch(/muitos pedidos/i)
    // O que mais importa: o banco não foi consultado, então nem a resposta
    // "existe / não existe" vaza.
    expect(requestFriendship).toHaveBeenCalledTimes(10)
  })

  it('o limite é por conta, não global', async () => {
    for (let i = 0; i < 10; i += 1) await pedir(umId())
    perfil = 'outra-pessoa'

    const r = await pedir(umId())
    expect(r.ok).toBeTruthy()
  })

  it('id malformado não gasta cota', async () => {
    /*
     * O limite vem depois da conferência de formato. Se viesse antes, quem
     * erra a digitação dez vezes ficaria de fora por causa dos próprios
     * erros — e id malformado nem chega ao banco.
     */
    for (let i = 0; i < 15; i += 1) {
      const r = await pedir('não-é-um-synse-id')
      expect(r.error).toMatch(/formato/i)
    }

    const r = await pedir(umId())
    expect(r.ok).toBeTruthy()
  })
})
