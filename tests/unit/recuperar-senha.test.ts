import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * ── A troca de senha, e a única regra que separa os dois caminhos ────────────
 *
 * Quem chega pelo link do e-mail não informa a senha atual: ela é justamente o
 * que esqueceu. Quem já está logado informa — e é isso que impede que um
 * navegador deixado aberto vire uma conta perdida, porque quem senta na
 * cadeira não sabe a senha e não consegue expulsar o dono.
 *
 * A marca que separa os dois é um cookie `httpOnly` escrito **só pelo
 * servidor**, depois de o Supabase aceitar o código de uso único do e-mail.
 *
 * Se essa distinção falhar para o lado errado, a exigência de senha atual vira
 * enfeite: bastaria abrir a tela de recuperação para trocar a senha de uma
 * sessão alheia. É o que estes testes prendem.
 */

const updateUser = vi.fn()
const signInWithPassword = vi.fn()
const resetPasswordForEmail = vi.fn()
const getUser = vi.fn()

let cookieDeRecuperacao: string | undefined
const cookieApagado = vi.fn()

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (nome: string) =>
      nome === 'synse_recuperacao' && cookieDeRecuperacao
        ? { value: cookieDeRecuperacao }
        : undefined,
    set: () => {},
    delete: (nome: string) => {
      cookieApagado(nome)
      cookieDeRecuperacao = undefined
    },
    getAll: () => [],
  }),
}))

vi.mock('next/navigation', () => ({
  redirect: (destino: string) => {
    throw new Error(`REDIRECT:${destino}`)
  },
}))

vi.mock('@/lib/database/supabase-server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { updateUser, signInWithPassword, resetPasswordForEmail, getUser },
  }),
}))

const { setNewPassword, requestPasswordReset } = await import('@/lib/auth/actions')

function formulario(campos: Record<string, string>) {
  const dados = new FormData()
  for (const [chave, valor] of Object.entries(campos)) dados.set(chave, valor)
  return dados
}

const SENHA_NOVA = { password: 'senha-nova-123', confirmacao: 'senha-nova-123' }

let contador = 0
const novoEmail = () => `pessoa${(contador += 1)}@exemplo.com`

beforeEach(() => {
  updateUser.mockReset().mockResolvedValue({ error: null })
  signInWithPassword.mockReset().mockResolvedValue({ error: null })
  resetPasswordForEmail.mockReset().mockResolvedValue({ error: null })
  getUser.mockReset().mockResolvedValue({ data: { user: { email: novoEmail() } } })
  cookieApagado.mockReset()
  cookieDeRecuperacao = undefined
})

describe('quem veio pelo link do e-mail', () => {
  beforeEach(() => {
    cookieDeRecuperacao = '1'
  })

  it('troca a senha sem informar a atual', async () => {
    const r = await setNewPassword({}, formulario(SENHA_NOVA))

    expect(r.sent).toBe(true)
    expect(updateUser).toHaveBeenCalledWith({ password: 'senha-nova-123' })
    // Não reautentica: não há senha atual para conferir.
    expect(signInWithPassword).not.toHaveBeenCalled()
  })

  it('a marca é apagada depois de usada', async () => {
    /*
     * Um link de uso único que deixa a porta encostada por quinze minutos
     * depois de usado não é de uso único.
     */
    await setNewPassword({}, formulario(SENHA_NOVA))
    expect(cookieApagado).toHaveBeenCalledWith('synse_recuperacao')
  })
})

describe('quem já estava logado', () => {
  it('sem a senha atual, não troca nada', async () => {
    /*
     * O teste mais importante do arquivo. Sem esta recusa, qualquer pessoa
     * num navegador aberto trocaria a senha e ficaria com a conta.
     */
    const r = await setNewPassword({}, formulario(SENHA_NOVA))

    expect(r.error).toMatch(/senha atual/i)
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('com a senha atual errada, não troca nada', async () => {
    signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } })

    const r = await setNewPassword({}, formulario({ ...SENHA_NOVA, senhaAtual: 'chute' }))

    expect(r.error).toMatch(/senha atual está incorreta/i)
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('com a senha atual certa, troca', async () => {
    const r = await setNewPassword({}, formulario({ ...SENHA_NOVA, senhaAtual: 'a-de-verdade' }))

    expect(r.sent).toBe(true)
    expect(signInWithPassword).toHaveBeenCalled()
    expect(updateUser).toHaveBeenCalledWith({ password: 'senha-nova-123' })
  })
})

describe('o que o formulário recusa antes de chegar ao Supabase', () => {
  beforeEach(() => {
    cookieDeRecuperacao = '1'
  })

  it('as duas senhas precisam bater', async () => {
    const r = await setNewPassword(
      {},
      formulario({ password: 'senha-nova-123', confirmacao: 'senha-nova-124' }),
    )

    expect(r.error).toMatch(/iguais/i)
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('menos de oito caracteres não passa', async () => {
    const r = await setNewPassword({}, formulario({ password: 'curta', confirmacao: 'curta' }))

    expect(r.error).toMatch(/8 caracteres/i)
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('sessão sem e-mail — o link expirou — não troca nada', async () => {
    getUser.mockResolvedValue({ data: { user: null } })

    const r = await setNewPassword({}, formulario(SENHA_NOVA))

    expect(r.error).toMatch(/sessão expirou/i)
    expect(updateUser).not.toHaveBeenCalled()
  })
})

describe('pedir o link', () => {
  it('responde igual com e sem conta — não entrega quem tem cadastro', async () => {
    const semConta = await requestPasswordReset({}, formulario({ email: novoEmail() }))

    resetPasswordForEmail.mockResolvedValue({ error: { message: 'User not found' } })
    const comErro = await requestPasswordReset({}, formulario({ email: novoEmail() }))

    expect(semConta).toEqual(comErro)
    expect(semConta.sent).toBe(true)
    expect(semConta.error).toBeUndefined()
  })

  it('o link volta para o callback, e não direto para a tela', async () => {
    /*
     * O código de uso único precisa virar sessão, e quem faz isso é
     * `/auth/callback`. Apontar o link direto para `/nova-senha` abriria uma
     * tela que não autentica ninguém — e a pessoa cairia de volta no login
     * sem entender por quê.
     */
    await requestPasswordReset({}, formulario({ email: novoEmail() }))

    const [, opcoes] = resetPasswordForEmail.mock.calls[0]
    expect(opcoes.redirectTo).toMatch(/\/auth\/callback\?next=\/nova-senha$/)
  })
})
