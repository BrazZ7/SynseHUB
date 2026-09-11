/**
 * Os três perfis que podem criar conta.
 *
 * A escolha vem antes da senha porque cada caminho pede dados diferentes logo
 * em seguida: academia e estúdio informam os dados do negócio, o aluno informa
 * o código de convite. Perguntar depois obrigaria a voltar.
 */
export const ACCOUNT_TYPES = ['academia', 'profissional', 'aluno'] as const

export type AccountType = (typeof ACCOUNT_TYPES)[number]

export function parseAccountType(value: string | undefined | null): AccountType | null {
  return ACCOUNT_TYPES.includes(value as AccountType) ? (value as AccountType) : null
}

/** Vocabulário de cada perfil. Muda o texto, não a estrutura. */
export const ACCOUNT_COPY: Record<
  AccountType,
  { titulo: string; descricao: string; emailExemplo: string }
> = {
  academia: {
    titulo: 'Cadastre sua academia',
    descricao: 'Primeiro criamos a sua conta. Em seguida você informa os dados da academia.',
    emailExemplo: 'voce@academia.com.br',
  },
  profissional: {
    titulo: 'Cadastre seu trabalho',
    descricao:
      'Personal, nutricionista ou estúdio. Primeiro criamos a sua conta, depois o seu espaço.',
    emailExemplo: 'voce@exemplo.com.br',
  },
  aluno: {
    titulo: 'Criar conta de aluno',
    descricao:
      'Primeiro criamos a sua conta. Depois você entra na sua academia com o código que ela te passou.',
    emailExemplo: 'voce@exemplo.com',
  },
}
