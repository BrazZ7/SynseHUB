'use client'

import { useState, useTransition } from 'react'
import { Check, Copy, LogOut } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { sairDoEsquadraoAction } from '@/features/squad/actions'
import type { Squad } from '@/types/domain'

/**
 * O convite, e a porta de saída.
 *
 * ── O código é o convite inteiro ────────────────────────────────────────────
 *
 * Seis caracteres que a pessoa dita no vestiário, manda no grupo de mensagens
 * ou mostra na tela. Não há convite por e-mail aqui de propósito: mandar
 * e-mail exigiria saber o endereço da outra pessoa, e o produto já resolveu
 * esse problema duas vezes com código — na entrada da academia (0011) e no
 * Synse ID da amizade (0037).
 *
 * `navigator.clipboard` pode não existir (contexto sem HTTPS, navegador
 * antigo): nesse caso o código continua na tela para ler em voz alta, que é
 * como ele vai ser usado na maioria das vezes mesmo.
 */
export function CodigoDoEsquadrao({ esquadrao, souDono }: { esquadrao: Squad; souDono: boolean }) {
  const [copiado, setCopiado] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [saindo, iniciar] = useTransition()

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(esquadrao.codigo)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // Sem área de transferência, o código continua visível para ditar.
    }
  }

  return (
    <section className="rounded-2xl border border-synse-border bg-synse-surface p-4 shadow-synse-sm">
      <p className="text-sm font-semibold text-synse-text">Chamar alguém</p>
      <p className="mt-0.5 text-xs text-synse-muted">
        Passe este código. Cabem {8 - esquadrao.membros}{' '}
        {8 - esquadrao.membros === 1 ? 'pessoa' : 'pessoas'} ainda.
      </p>

      <div className="mt-3 flex items-center gap-2">
        <code className="flex-1 rounded-xl border border-synse-border bg-synse-surface-2 px-3 py-2.5 text-center text-lg font-semibold tracking-[0.3em] text-synse-text">
          {esquadrao.codigo}
        </code>
        <Button variant="outline" size="icon" onClick={copiar} aria-label="Copiar o código">
          {copiado ? <Check className="size-4" /> : <Copy className="size-4" />}
        </Button>
      </div>

      <div className="mt-4 border-t border-synse-border pt-3">
        {confirmando ? (
          <div className="space-y-2">
            <p className="text-xs text-synse-muted">
              {souDono
                ? 'Você é o dono: quem entrou primeiro depois de você assume o esquadrão.'
                : 'Você sai do esquadrão e para de ver o lobby.'}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                disabled={saindo}
                onClick={() =>
                  iniciar(async () => {
                    const r = await sairDoEsquadraoAction(esquadrao.id)
                    if (!r.ok) {
                      setErro(r.erro ?? 'Não deu para sair.')
                      setConfirmando(false)
                    }
                  })
                }
              >
                {saindo ? 'Saindo…' : 'Confirmar saída'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmando(false)}>
                Ficar
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmando(true)}
            className="inline-flex items-center gap-1.5 text-xs text-synse-muted hover:text-synse-text"
          >
            <LogOut className="size-3.5" aria-hidden />
            Sair do esquadrão
          </button>
        )}
        {erro && <p className="mt-2 text-xs text-synse-danger">{erro}</p>}
      </div>
    </section>
  )
}
