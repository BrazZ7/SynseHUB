'use client'

import { Loader2, ShieldCheck, UserMinus, UserPlus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { ConfirmDialog } from '@/components/synse/confirm-dialog'
import { Feedback } from '@/components/synse/form-field'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { grantBodyShareAction, revokeBodyShareAction } from '@/features/synse-body/actions'
import { formatDate } from '@/lib/utils'
import type { BodyMeasurementShare, EquipeParaAutorizar } from '@/types/domain'

/**
 * ── Quem vê o seu corpo ─────────────────────────────────────────────────────
 *
 * A 0032 criou `body_measurement_shares` com o desenho certo — autorização
 * nominal, por pessoa, revogável — e as actions que a operam. O que nunca
 * existiu foi esta tela: `grantBodyShareAction` revalidava
 * `/app/corpo/compartilhamento`, uma rota que não estava no repositório.
 *
 * Bioimpedância diz gordura visceral, água corporal e massa magra. Um controle
 * assim existir no banco e não ter porta não é tela faltando: é a pessoa sem
 * como exercer um direito que o sistema diz respeitar.
 *
 * ── Revogar fica antes de autorizar ─────────────────────────────────────────
 *
 * A ordem não é estética. Quem abre uma tela de privacidade quase sempre vem
 * tirar acesso, não dar: a pergunta é "quem está vendo isto?". A lista de
 * quem já vê vem primeiro, e o botão de autorizar depois.
 */

/**
 * O papel, como a pessoa chama.
 *
 * A lista cobre o enum `user_role` inteiro da 0001, e não um palpite: a
 * primeira versão trazia um `ADMIN` que não existe e não trazia `MANAGER`,
 * que existe — e a tela mostrou "MANAGER" cru ao lado do nome de uma pessoa.
 * Visto na tela, não lendo o código.
 *
 * O `??` abaixo continua, para o enum crescer sem quebrar nada; o que ele não
 * deve é virar o caminho normal.
 */
const PAPEIS: Record<string, string> = {
  SUPER_ADMIN: 'Plataforma',
  OWNER: 'Dono',
  MANAGER: 'Gerente',
  RECEPTIONIST: 'Recepção',
  TRAINER: 'Professor',
  NUTRITIONIST: 'Nutricionista',
  STUDENT: 'Aluno',
  PROFESSIONAL: 'Profissional',
}

function papel(role: string): string {
  return PAPEIS[role] ?? role
}

export function Compartilhamento({
  autorizados,
  equipe,
}: {
  autorizados: BodyMeasurementShare[]
  equipe: EquipeParaAutorizar[]
}) {
  const router = useRouter()
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  function depois(resultado: { status: 'success' } | { status: 'error'; message: string }) {
    if (resultado.status === 'error') {
      setErro(resultado.message)
      return
    }
    setErro(null)
    /*
     * `refresh` e não estado local: as duas listas mudam juntas — quem sai de
     * "autorizados" volta a aparecer em "pode autorizar", e quem entra some
     * da outra. Manter isso na mão daria duas fontes para o mesmo fato.
     */
    router.refresh()
  }

  async function revogar(shareId: string) {
    depois(await revokeBodyShareAction(shareId))
  }

  function autorizar(perfilId: string, organizationId: string) {
    iniciar(async () => {
      depois(await grantBodyShareAction(perfilId, organizationId))
    })
  }

  return (
    <div className="space-y-5">
      {erro && <Feedback tone="error" message={erro} />}

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-synse-text">Quem vê hoje</h2>
          <p className="text-xs text-synse-muted">
            Estas pessoas abrem o seu histórico de peso e composição corporal. Você pode tirar o
            acesso a qualquer momento, sem avisar ninguém.
          </p>
        </div>

        {autorizados.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-synse-border bg-synse-surface/60 p-5 text-center text-sm text-synse-muted">
            Ninguém além de você vê as suas medições.
          </p>
        ) : (
          <ul className="space-y-2">
            {autorizados.map((autorizacao) => (
              <li
                key={autorizacao.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-synse-border bg-synse-surface p-4 shadow-synse-sm"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-synse-text">
                    {autorizacao.sharedWithName ?? 'Pessoa da equipe'}
                  </p>
                  <p className="text-xs text-synse-muted">
                    Autorizado em {formatDate(autorizacao.grantedAt)}
                  </p>
                </div>

                <ConfirmDialog
                  trigger={
                    <Button variant="outline" size="sm" className="shrink-0">
                      <UserMinus className="size-4" aria-hidden />
                      Tirar acesso
                    </Button>
                  }
                  title="Tirar o acesso?"
                  description={`${autorizacao.sharedWithName ?? 'Esta pessoa'} deixa de ver o seu histórico de corpo na hora. Você pode autorizar de novo depois.`}
                  confirmLabel="Tirar acesso"
                  destructive
                  onConfirm={() => revogar(autorizacao.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-synse-text">Autorizar alguém</h2>
          <p className="text-xs text-synse-muted">
            Só a equipe da sua academia aparece aqui — e autorizar é por pessoa, nunca pela academia
            inteira.
          </p>
        </div>

        {equipe.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-synse-border bg-synse-surface/60 p-5 text-center text-sm text-synse-muted">
            {autorizados.length > 0
              ? 'Você já autorizou todo mundo da equipe.'
              : 'Você não tem academia com equipe para autorizar.'}
          </p>
        ) : (
          <ul className="space-y-2">
            {equipe.map((pessoa) => (
              <li
                key={pessoa.profileId}
                className="flex items-center justify-between gap-3 rounded-2xl border border-synse-border bg-synse-surface p-4 shadow-synse-sm"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-synse-text">
                    {pessoa.name ?? 'Pessoa da equipe'}
                  </p>
                  <p className="flex flex-wrap items-center gap-1.5 text-xs text-synse-muted">
                    <Badge variant="outline">{papel(pessoa.role)}</Badge>
                    {pessoa.organizationName}
                  </p>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  disabled={pendente}
                  onClick={() => autorizar(pessoa.profileId, pessoa.organizationId)}
                >
                  {pendente ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <UserPlus className="size-4" aria-hidden />
                  )}
                  Autorizar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="flex items-start gap-2.5 rounded-xl bg-synse-surface-2 p-4 text-xs text-synse-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        Treinar na mesma academia não dá acesso ao seu corpo. Só quem está na lista acima vê, e só
        enquanto estiver.
      </p>
    </div>
  )
}
