/**
 * Dois perfis de cadastro. Não três, nem quatro.
 *
 * Já foram quatro — academia, profissional, aluno e pessoal — e a primeira
 * tela virou um teste de leitura: quem chega não sabe ainda a diferença entre
 * "profissional" e "academia", e quem só quer treinar precisava ler as quatro
 * para descobrir que duas eram a mesma coisa para ele.
 *
 * O corte que sobrou é o único que a pessoa sabe responder antes de conhecer o
 * produto: **eu administro uma academia, ou eu treino?**
 *
 * Aluno deixou de ser um tipo próprio porque nunca foi: é uma pessoa física
 * com um código de academia — e o código agora é campo opcional, não porta
 * separada. Profissional também não é tipo de conta: é acesso que se assina,
 * dentro do perfil (migration 0015).
 */
export const ACCOUNT_TYPES = ['pessoal', 'academia'] as const

export type AccountType = (typeof ACCOUNT_TYPES)[number]

/**
 * Os nomes antigos ainda chegam: ficaram em e-mails de confirmação enviados
 * antes desta mudança, e num link já compartilhado. Todos caem na entrada de
 * pessoa física — inclusive `profissional`, que é justamente quem passa a
 * entrar como pessoa e liberar o espaço depois.
 */
const LEGADO: Record<string, AccountType> = {
  aluno: 'pessoal',
  profissional: 'pessoal',
}

export function parseAccountType(value: string | undefined | null): AccountType | null {
  if (!value) return null
  if (ACCOUNT_TYPES.includes(value as AccountType)) return value as AccountType
  return LEGADO[value] ?? null
}

/** Vocabulário de cada perfil. Muda o texto, não a estrutura. */
export const ACCOUNT_COPY: Record<
  AccountType,
  { titulo: string; descricao: string; emailExemplo: string }
> = {
  pessoal: {
    titulo: 'Criar sua conta',
    descricao:
      'Treino, alimentação e desafios. Com ou sem academia — se a sua usa o Synse, é só informar o código depois.',
    emailExemplo: 'voce@exemplo.com',
  },
  academia: {
    titulo: 'Cadastre sua academia',
    descricao: 'Primeiro criamos a sua conta. Em seguida você informa os dados da academia.',
    emailExemplo: 'voce@academia.com.br',
  },
}
