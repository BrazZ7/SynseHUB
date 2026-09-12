'use client'

import { Check, Lock } from 'lucide-react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { openProfessionalSpaceAction } from '@/features/account/actions'
import { initialAccountState } from '@/features/account/state'

const ACESSOS = [
  'Treinador: montar treinos e acompanhar a evolução dos seus alunos',
  'Fisioterapeuta: avaliações, restrições e evolução clínica',
  'Nutricionista: planos alimentares individuais, com autoria registrada',
  'Cobrança pelos seus atendimentos, com o Synse Pay',
]

/**
 * O perfil profissional, dentro da conta — não na porta de entrada.
 *
 * Como tipo de cadastro ele obrigava quem chega a decidir, antes de ver o
 * produto, entre "profissional" e "academia" — duas palavras que só se
 * distinguem depois de usar. Como acesso, a pergunta só aparece para quem já
 * está dentro e sabe que precisa dele.
 */
export function ProfessionalCard({ ativo, defaultName }: { ativo: boolean; defaultName: string }) {
  const [state, formAction] = useActionState(openProfessionalSpaceAction, initialAccountState)

  return (
    <section className="rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-synse-text">Perfil profissional</h2>
        <Badge variant={ativo ? 'success' : 'outline'}>{ativo ? 'Plano ativo' : 'Synse Pro'}</Badge>
      </div>

      <p className="mt-1 text-sm text-synse-muted">
        Atende alunos? O perfil profissional abre o seu espaço no painel, com agenda, treinos e
        cobrança próprios.
      </p>

      <ul className="mt-3 space-y-1.5">
        {ACESSOS.map((acesso) => (
          <li key={acesso} className="flex items-start gap-2 text-xs text-synse-muted">
            <Check className="mt-0.5 size-3.5 shrink-0 text-synse-primary" aria-hidden />
            {acesso}
          </li>
        ))}
      </ul>

      {ativo ? (
        <form action={formAction} className="mt-4 space-y-2">
          <Label htmlFor="spaceName">Nome do seu espaço</Label>
          <div className="flex items-end gap-2">
            <Input
              id="spaceName"
              name="name"
              required
              defaultValue={defaultName}
              placeholder="Studio Ana Ribeiro"
            />
            <SubmitButton />
          </div>
          <p className="text-xs text-synse-muted">
            Ao abrir, sua conta passa a entrar direto no painel profissional.
          </p>
          {state.error && (
            <p role="alert" className="text-xs text-synse-danger">
              {state.error}
            </p>
          )}
        </form>
      ) : (
        <div className="mt-4 space-y-2">
          <Button variant="gradient" className="w-full" disabled>
            <Lock className="size-4" aria-hidden />
            Assinar o perfil profissional
          </Button>
          <p className="text-xs text-synse-muted">
            A assinatura entra junto com a integração real de pagamento. Ela é separada do plano que
            a academia paga pelo SynseHub.
          </p>
        </div>
      )}
    </section>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Abrindo…' : 'Abrir espaço'}
    </Button>
  )
}
