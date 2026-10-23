import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A tela de login responde a mesma frase para senha errada, conta inexistente e
 * e-mail não confirmado — de propósito, para não revelar quais e-mails existem.
 * Isso já custou horas de investigação: com a senha certa e o e-mail pendente,
 * a pessoa lê "senha incorreta" e tenta a mesma senha de novo, para sempre.
 *
 * O GoTrue confere a senha antes de olhar a confirmação, então
 * `email_not_confirmed` só chega a quem acertou a senha. Dizer isso em voz alta
 * não revela nada que a pessoa já não tenha provado. Estes testes prendem essa
 * distinção: o caso genérico continua genérico, o confirmável fala.
 */

const signInWithPassword = vi.fn()

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: () => undefined,
    set: () => {},
    delete: () => {},
    getAll: () => [],
  }),
}))

vi.mock('next/navigation', () => ({
  redirect: (destino: string) => {
    throw new Error(`REDIRECT:${destino}`)
  },
}))

vi.mock('@/lib/database/supabase-server', () => ({
  createSupabaseServerClient: async () => ({ auth: { signInWithPassword } }),
}))

const { signInWithPassword: entrar } = await import('@/lib/auth/actions')

function formulario(email: string, senha: string) {
  const dados = new FormData()
  dados.set('email', email)
  dados.set('password', senha)
  return dados
}

/** E-mail novo a cada teste: o limitador de tentativas conta por endereço. */
let contador = 0
const novoEmail = () => `pessoa${(contador += 1)}@exemplo.com`

beforeEach(() => {
  signInWithPassword.mockReset()
})

describe('signInWithPassword', () => {
  it('não revela nada quando a credencial está errada', async () => {
    signInWithPassword.mockResolvedValue({
      error: { message: 'Invalid login credentials', code: 'invalid_credentials', status: 400 },
    })

    const estado = await entrar({}, formulario(novoEmail(), 'senha-errada'))

    expect(estado.error).toBe('E-mail ou senha incorretos.')
  })

  it('diz que falta confirmar o e-mail — a senha já foi aceita nesse caso', async () => {
    signInWithPassword.mockResolvedValue({
      error: { message: 'Email not confirmed', code: 'email_not_confirmed', status: 400 },
    })

    const estado = await entrar({}, formulario(novoEmail(), 'senha-correta'))

    expect(estado.error).toContain('Confirme seu e-mail')
    expect(estado.error).not.toBe('E-mail ou senha incorretos.')
  })

  it('separa excesso de tentativas de credencial errada', async () => {
    signInWithPassword.mockResolvedValue({
      error: {
        message: 'Request rate limit reached',
        code: 'over_request_rate_limit',
        status: 429,
      },
    })

    const estado = await entrar({}, formulario(novoEmail(), 'senha-qualquer'))

    expect(estado.error).toContain('Muitas tentativas')
  })

  it('não chama de senha errada uma chave inválida do Supabase', async () => {
    signInWithPassword.mockResolvedValue({
      error: { message: 'Invalid API key', code: 'invalid_api_key', status: 401 },
    })

    const estado = await entrar({}, formulario(novoEmail(), 'senha-correta'))

    expect(estado.error).toContain('indisponível')
    expect(estado.error).not.toBe('E-mail ou senha incorretos.')
  })

  it('não chama de senha errada um projeto fora do ar', async () => {
    signInWithPassword.mockResolvedValue({
      error: { message: 'Service unavailable', code: undefined, status: 503 },
    })

    const estado = await entrar({}, formulario(novoEmail(), 'senha-correta'))

    expect(estado.error).toContain('indisponível')
  })

  it('recusa senha menor que o mínimo antes de chamar o Supabase', async () => {
    const estado = await entrar({}, formulario(novoEmail(), 'curta'))

    expect(estado.error).toBe('Informe um e-mail válido e a sua senha.')
    expect(signInWithPassword).not.toHaveBeenCalled()
  })

  it('leva ao painel quando a credencial é aceita', async () => {
    signInWithPassword.mockResolvedValue({ error: null })

    await expect(entrar({}, formulario(novoEmail(), 'senha-correta'))).rejects.toThrow(
      'REDIRECT:/dashboard',
    )
  })
})
