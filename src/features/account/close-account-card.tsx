'use client'

import { TriangleAlert } from 'lucide-react'
import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'

import { Feedback } from '@/components/synse/form-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { closeAccountAction } from '@/features/account/actions'
import { CLOSE_ACCOUNT_INITIAL } from '@/features/account/state'

/**
 * Encerrar a conta, dentro do produto.
 *
 * Fica fechado atrás de um toque de propósito, e não escondido: a Política de
 * Privacidade promete esse direito e a loja da Apple exige que ele exista aqui
 * dentro — mas ninguém precisa tropeçar nele no meio das configurações.
 *
 * O texto lista o que fica antes de perguntar se pode apagar. Uma tela que só
 * diz "isto é irreversível" assusta sem informar: a dúvida real de quem
 * encerra é se a academia continuará com a cobrança em aberto, e se o
 * consentimento que ela deu some junto.
 */
export function CloseAccountCard() {
  const [state, formAction] = useActionState(closeAccountAction, CLOSE_ACCOUNT_INITIAL)
  const [aberto, setAberto] = useState(false)

  return (
    <section className="rounded-2xl border border-synse-danger/30 bg-synse-surface p-5 shadow-synse-sm">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-synse-text">
        <TriangleAlert className="size-4 text-synse-danger" aria-hidden />
        Encerrar minha conta
      </h2>
      <p className="text-xs text-synse-muted">
        Apaga sua conta pessoal e tudo que é só seu. Não dá para desfazer.
      </p>

      {!aberto ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => setAberto(true)}
        >
          Quero encerrar
        </Button>
      ) : (
        <form action={formAction} className="mt-4 space-y-3">
          <div className="space-y-2 text-xs text-synse-muted">
            <p className="font-medium text-synse-text">O que é apagado</p>
            <p>
              Seu nome, e-mail, telefone e foto. Suas corridas e trajetos, seus recordes, seus
              desafios e medalhas, e seus avisos.
            </p>

            <p className="pt-1 font-medium text-synse-text">O que continua guardado, e por quê</p>
            <ul className="list-disc space-y-1 pl-4">
              <li>
                <strong>O registro dos seus consentimentos.</strong> É a prova de que houve
                autorização e de quando — a lei cobra isso de quem trata os dados, inclusive depois
                que você sai.
              </li>
              <li>
                <strong>Cobranças e pagamentos.</strong> São registro fiscal da academia, com prazo
                legal de guarda.
              </li>
              <li>
                <strong>Sua ficha na academia</strong> — presenças, treinos e avaliações. O registro
                é dela, não nosso, e sua matrícula é encerrada.
              </li>
            </ul>
          </div>

          {state.error && <Feedback tone="error" message={state.error} />}

          <div className="space-y-1.5">
            <Label htmlFor="confirmacao">Digite APAGAR para confirmar</Label>
            <Input
              id="confirmacao"
              name="confirmacao"
              required
              autoComplete="off"
              autoCapitalize="characters"
              placeholder="APAGAR"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <SubmitButton />
            <Button type="button" variant="ghost" size="sm" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </section>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" variant="destructive" disabled={pending}>
      {pending ? 'Encerrando…' : 'Encerrar minha conta'}
    </Button>
  )
}
