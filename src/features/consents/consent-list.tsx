'use client'

import Link from 'next/link'
import { ExternalLink, ShieldCheck } from 'lucide-react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { recordConsentAction } from '@/features/consents/actions'
import { CONSENT_INITIAL_STATE } from '@/features/consents/state'
import { formatDate } from '@/lib/utils'
import type { ConsentState } from '@/types/domain'

/**
 * Privacidade, com o que a pessoa de fato autorizou.
 *
 * Antes esta lista era escrita à mão no código: quatro linhas com selo fixo de
 * "Aceito" ou "Não autorizado", e embaixo a frase de que tudo era registrado
 * com versão e data. Nada disso existia — e afirmar controle que não existe é
 * pior do que não oferecer controle nenhum, porque a pessoa deixa de procurar.
 */
export function ConsentList({ consents }: { consents: readonly ConsentState[] }) {
  const [state, formAction] = useActionState(recordConsentAction, CONSENT_INITIAL_STATE)

  const semRegistro = consents.filter((item) => item.required && !item.accepted)

  return (
    <section className="rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-synse-text">
        <ShieldCheck className="size-4 text-synse-muted" aria-hidden />
        Privacidade
      </h2>
      <p className="mb-4 text-xs text-synse-muted">
        Cada resposta abaixo é gravada com a versão do documento e a data. Você pode mudar de ideia
        a qualquer momento.
      </p>

      {semRegistro.length > 0 && (
        /*
         * Quem criou a conta antes desta tela existir aceitou os termos por uma
         * frase no formulário, e nada foi guardado. Não dá para inventar a data
         * depois — o honesto é dizer que falta o registro e oferecer o botão.
         */
        <p className="mb-4 rounded-lg bg-synse-warning/10 p-3 text-xs text-synse-text">
          Sua conta é anterior a este registro. Confirme abaixo para deixar guardado o aceite dos
          documentos obrigatórios, com a data de hoje.
        </p>
      )}

      <ul className="space-y-3">
        {consents.map((item) => (
          <li
            key={item.consentType}
            className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 border-b border-synse-border pb-3 last:border-0 last:pb-0"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-synse-text">{item.title}</span>
                {item.required && (
                  <Badge variant="outline" className="text-[10px]">
                    Obrigatório
                  </Badge>
                )}
                {item.url && (
                  <Link
                    href={item.url}
                    className="inline-flex items-center gap-1 text-xs text-synse-primary hover:underline"
                  >
                    Ler
                    <ExternalLink className="size-3" aria-hidden />
                  </Link>
                )}
              </div>
              <p className="mt-0.5 text-xs text-synse-muted">{item.description}</p>
              <p className="mt-1 text-[11px] text-synse-muted">{registro(item)}</p>
            </div>

            <form action={formAction} className="shrink-0">
              <input type="hidden" name="consentType" value={item.consentType} />
              <input type="hidden" name="accepted" value={item.accepted ? 'false' : 'true'} />
              <Alternar aceito={item.accepted} obrigatorio={item.required} />
            </form>
          </li>
        ))}
      </ul>

      {state.error && (
        <p role="alert" className="mt-3 text-xs text-synse-danger">
          {state.error}
        </p>
      )}
      {state.message && <p className="mt-3 text-xs text-synse-muted">{state.message}</p>}
    </section>
  )
}

/** A linha embaixo do título: o que está registrado, e desde quando. */
function registro(item: ConsentState): string {
  if (item.accepted && item.respondedAt) {
    return `Autorizado em ${formatDate(item.respondedAt)} · versão ${item.version}`
  }
  if (item.revokedAt) return `Retirado em ${formatDate(item.revokedAt)}`
  if (item.outdated) return `O documento mudou. Sua resposta anterior é de outra versão.`
  return 'Sem registro ainda'
}

function Alternar({ aceito, obrigatorio }: { aceito: boolean; obrigatorio: boolean }) {
  const { pending } = useFormStatus()

  /*
   * Obrigatório aceito não vira botão de desligar: retirar termos ou
   * privacidade com a conta aberta deixaria o produto usando dados que a pessoa
   * acabou de dizer que não autoriza. A saída existe, e é encerrar a conta.
   */
  if (obrigatorio && aceito) {
    return <Badge variant="success">Aceito</Badge>
  }

  return (
    <Button
      type="submit"
      size="sm"
      variant={aceito ? 'outline' : 'default'}
      disabled={pending}
      aria-label={`${aceito ? 'Retirar' : 'Autorizar'} — ${obrigatorio ? 'documento obrigatório' : 'opcional'}`}
    >
      {pending ? '…' : aceito ? 'Retirar' : 'Autorizar'}
    </Button>
  )
}
