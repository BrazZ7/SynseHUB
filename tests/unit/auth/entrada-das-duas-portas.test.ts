import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { outraPorta } from '@/features/auth/portas'
import type { UserRole } from '@/types/domain'

/**
 * A entrada do aluno e a da academia — prioridade 1 do pedido, aceite 21.
 *
 * Duas coisas são testadas aqui, e elas vêm de defeitos diferentes.
 *
 * **A porta entre os dois lados.** Quem administra uma academia e treina nela
 * tem papel de hub e matrícula de aluno. As duas rotas já aceitavam essa
 * pessoa — `requireHubSession` pelo papel, `requireStudentSession` pela
 * matrícula — e nenhuma tela oferecia a passagem: só funcionava digitando o
 * endereço. O seletor de contexto resolve isso para conta de plataforma e
 * começa com `if (!session.isPlatformAccount) return null`.
 *
 * **O texto da entrada.** O `/login` dizia "Acesse o painel da sua academia" e
 * convidava a "Cadastre sua academia". O fluxo sempre atendeu os dois lados; o
 * texto da porta é que mandava o aluno embora.
 */

const conta = (campos: {
  role: UserRole
  studentId?: string | null
  isPlatformAccount?: boolean
}) => ({
  role: campos.role,
  studentId: campos.studentId ?? null,
  isPlatformAccount: campos.isPlatformAccount ?? false,
})

describe('a porta para o outro lado', () => {
  it('no app, quem administra a academia vê o caminho para o painel', () => {
    const porta = outraPorta(conta({ role: 'OWNER', studentId: 'aluno-1' }), 'app', 'Academia Alfa')
    expect(porta?.href).toBe('/dashboard')
    expect(porta?.detalhe).toBe('Academia Alfa')
  })

  it('no painel, quem tem matrícula vê o caminho para o treino', () => {
    const porta = outraPorta(conta({ role: 'OWNER', studentId: 'aluno-1' }), 'hub')
    expect(porta?.href).toBe('/app')
  })

  it('aluno comum não vê porta nenhuma', () => {
    // Ela levaria a um redirecionamento: `requireHubSession` nega aluno.
    expect(outraPorta(conta({ role: 'STUDENT', studentId: 'aluno-1' }), 'app')).toBeNull()
  })

  it('quem administra e não é aluno não vê o caminho para o treino', () => {
    /*
     * O app exige matrícula, não papel: `requireStudentSession` manda para o
     * painel quem não tem `studentId`. Oferecer o link aqui seria um botão que
     * devolve a pessoa de onde ela veio — o mesmo sintoma de "botão que não
     * responde" que o seletor de contexto já teve.
     */
    expect(outraPorta(conta({ role: 'MANAGER', studentId: null }), 'hub')).toBeNull()
  })

  it('treinador com matrícula também tem as duas portas', () => {
    // O papel de treinador é de hub; se ele treina na academia, é aluno também.
    expect(outraPorta(conta({ role: 'TRAINER', studentId: 'aluno-9' }), 'app')?.href).toBe(
      '/dashboard',
    )
    expect(outraPorta(conta({ role: 'TRAINER', studentId: 'aluno-9' }), 'hub')?.href).toBe('/app')
  })

  it('conta de plataforma não ganha a porta: ela já tem o seletor', () => {
    // Oferecer os dois seria dois caminhos para o mesmo lugar, e o seletor faz
    // mais: ele entra em qualquer academia.
    const plataforma = conta({ role: 'SUPER_ADMIN', studentId: 'aluno-1', isPlatformAccount: true })
    expect(outraPorta(plataforma, 'app')).toBeNull()
    expect(outraPorta(plataforma, 'hub')).toBeNull()
  })

  it('sem nome da academia, o detalhe não fica vazio', () => {
    expect(outraPorta(conta({ role: 'OWNER', studentId: 'a' }), 'app')?.detalhe).toBeTruthy()
  })
})

describe('o texto da entrada', () => {
  const login = readFileSync(join(process.cwd(), 'src/app/(auth)/login/page.tsx'), 'utf8')
  const landing = readFileSync(join(process.cwd(), 'src/app/page.tsx'), 'utf8')

  /** Só o que a pessoa lê: o arquivo explica o defeito antigo em comentário. */
  const semComentarios = (fonte: string) =>
    fonte.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '')

  it('o login não se apresenta como software de academia', () => {
    const visivel = semComentarios(login)
    expect(visivel).not.toMatch(/Acesse o painel da sua academia/)
    expect(visivel).not.toMatch(/Cadastre sua academia/)
  })

  it('o login diz que a conta serve para os dois', () => {
    expect(semComentarios(login)).toMatch(/o seu treino e o painel da academia/)
  })

  it('a entrada diz quem é o público antes de pedir a conta', () => {
    // Controle: a frase precisa estar no que é renderizado, não num comentário
    // explicando que deveria estar.
    expect(semComentarios(landing)).toMatch(/Para academias e para quem treina/)
  })

  it('a escolha de perfil continua depois da conta existir', () => {
    /*
     * A ordem é deliberada e está documentada em `src/app/onboarding/page.tsx`:
     * perguntar antes obrigava a resposta a atravessar a criação de senha, o
     * e-mail de confirmação e a volta para o site, e ela se perdia em cada
     * trecho — quem escolhia "sou aluno" voltava por link de e-mail e caía num
     * formulário pedindo CNPJ.
     *
     * Então a entrada **não** pode passar a perguntar na porta. Este teste
     * falha se alguém puser o tipo de conta no link de cadastro.
     */
    expect(semComentarios(landing)).not.toMatch(/\/signup\?tipo=/)
    expect(semComentarios(login)).not.toMatch(/\/signup\?tipo=/)
  })
})
