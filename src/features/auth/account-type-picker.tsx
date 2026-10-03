import Link from 'next/link'
import { Building2, UserRound } from 'lucide-react'

/**
 * Escolha do perfil, depois de a conta existir e o e-mail estar confirmado.
 *
 * Perguntar antes obrigava a escolha a atravessar a criação de senha, o e-mail
 * de confirmação e a volta para o site — e ela se perdia em cada trecho. Quem
 * escolhia "sou aluno" e voltava por link de e-mail caía num formulário
 * pedindo CNPJ.
 *
 * São duas opções porque o corte é binário: administrar uma academia é um
 * trabalho, treinar é outro. O resto — vínculo com academia, perfil de
 * treinador — é ajuste dentro da conta, não uma quarta porta na entrada.
 */
const OPCOES = [
  {
    tipo: 'pessoal',
    icone: UserRound,
    titulo: 'Sou pessoa física',
    descricao: 'Treinar, acompanhar resultados e participar dos desafios. Com ou sem academia.',
  },
  {
    tipo: 'academia',
    icone: Building2,
    titulo: 'Tenho uma academia',
    descricao: 'Gestão de alunos, mensalidades, treinos e check-in.',
  },
] as const

export function AccountTypePicker() {
  return (
    <div className="space-y-3">
      {OPCOES.map(({ tipo, icone: Icone, titulo, descricao }) => (
        <Link
          key={tipo}
          href={`/onboarding?tipo=${tipo}`}
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

      <p className="pt-1 text-center text-xs text-synse-muted">
        É treinador, fisioterapeuta ou nutricionista? Entre como pessoa física — o perfil
        profissional é liberado depois, no seu perfil.
      </p>
    </div>
  )
}
