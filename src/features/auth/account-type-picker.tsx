import Link from 'next/link'
import { Building2, Dumbbell, UserRound } from 'lucide-react'

/**
 * Escolha do perfil, antes de qualquer dado.
 *
 * Antes desta tela, "criar conta" significava uma coisa só: abrir academia.
 * Quem chegava aluno ou profissional não tinha caminho — e o site nem oferecia
 * o botão.
 */
const OPCOES = [
  {
    tipo: 'academia',
    icone: Building2,
    titulo: 'Tenho uma academia',
    descricao: 'Gestão de alunos, mensalidades, treinos e check-in.',
  },
  {
    tipo: 'profissional',
    icone: Dumbbell,
    titulo: 'Sou profissional',
    descricao: 'Personal, nutricionista ou estúdio. Seus alunos, do seu jeito.',
  },
  {
    tipo: 'aluno',
    icone: UserRound,
    titulo: 'Sou aluno',
    descricao: 'Entre com o código da sua academia e acompanhe seus treinos.',
  },
] as const

export function AccountTypePicker() {
  return (
    <div className="space-y-3">
      {OPCOES.map(({ tipo, icone: Icone, titulo, descricao }) => (
        <Link
          key={tipo}
          href={`/signup?tipo=${tipo}`}
          className="focus-visible:ring-synse-primary/25 flex items-start gap-3.5 rounded-xl border border-synse-border bg-synse-surface p-4 transition hover:border-synse-primary hover:shadow-synse-sm focus-visible:outline-none focus-visible:ring-2"
        >
          <span className="bg-synse-primary/10 mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg">
            <Icone className="size-4.5 text-synse-primary" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-synse-text">{titulo}</span>
            <span className="block text-sm text-synse-muted">{descricao}</span>
          </span>
        </Link>
      ))}
    </div>
  )
}
