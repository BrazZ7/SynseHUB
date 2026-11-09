'use client'

import { Settings, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * A barra lateral da conta.
 *
 * Privacidade, perfil profissional, vínculo com a academia, encerrar conta e
 * sair viviam soltos no fim do feed do perfil. São ajustes: coisas que se
 * procura quando se precisa, não que se lê ao rolar. Ficavam empurrando para
 * baixo o que a pessoa realmente abre o perfil para ver.
 *
 * ── Por que gaveta, e não uma coluna ────────────────────────────────────────
 *
 * Barra lateral de verdade só existe onde há largura sobrando. Este app tem
 * largura de telefone mesmo no desktop, de propósito — é decisão da casca do
 * Synse App. A gaveta que entra pela direita é a mesma coisa em tela estreita:
 * fica fora do caminho, abre por um ícone e cobre o conteúdo enquanto está
 * aberta.
 *
 * ── O que ela precisa fazer para não ser uma `div` que aparece ──────────────
 *
 * Um painel que cobre a tela é um diálogo, e diálogo tem obrigações: fechar no
 * Esc, fechar no toque fora, travar a rolagem do que está atrás, levar o foco
 * para dentro ao abrir e **devolver** o foco ao botão ao fechar. Sem a última,
 * quem navega por teclado volta para o começo da página toda vez.
 *
 * Vai para o `body` por portal. O cartão da capa tem `overflow-hidden`, e
 * bastaria alguém pôr um `transform` num ancestral para o painel `fixed` ser
 * recortado dentro dele. O portal tira essa dependência do caminho.
 */
export function MenuDaConta({
  children,
  resumo,
}: {
  children: React.ReactNode
  /** Uma linha sobre a conta, mostrada no topo da gaveta. */
  resumo: string
}) {
  const [aberto, setAberto] = useState(false)
  const [montado, setMontado] = useState(false)
  const gatilho = useRef<HTMLButtonElement>(null)
  const fechar = useRef<HTMLButtonElement>(null)

  useEffect(() => setMontado(true), [])

  const fecharGaveta = useCallback(() => {
    setAberto(false)
    gatilho.current?.focus()
  }, [])

  useEffect(() => {
    if (!aberto) return

    const noEsc = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') fecharGaveta()
    }
    document.addEventListener('keydown', noEsc)

    // Sem isto a página de trás rola junto com o dedo dentro da gaveta.
    const rolagem = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    fechar.current?.focus()

    return () => {
      document.removeEventListener('keydown', noEsc)
      document.body.style.overflow = rolagem
    }
  }, [aberto, fecharGaveta])

  const painel = (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-label="Conta e ajustes"
    >
      <button
        type="button"
        aria-label="Fechar"
        tabIndex={-1}
        onClick={fecharGaveta}
        className="absolute inset-0 animate-fade-in bg-synse-dark/70"
      />

      <div className="absolute inset-y-0 right-0 flex w-[88%] max-w-sm flex-col border-l border-synse-border bg-synse-bg shadow-2xl">
        <div className="flex items-start gap-3 border-b border-synse-border px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-synse-text">Minha conta Synse</p>
            <p className="truncate text-xs text-synse-muted">{resumo}</p>
          </div>
          <button
            ref={fechar}
            type="button"
            onClick={fecharGaveta}
            aria-label="Fechar"
            className="-mr-1 -mt-1 grid size-9 shrink-0 place-items-center rounded-lg text-synse-muted transition-colors hover:bg-synse-surface-2 hover:text-synse-text"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        {/* A gaveta rola por dentro: a lista cresce com consentimento novo. */}
        <div className="synse-scroll flex-1 space-y-4 overflow-y-auto px-5 py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>
  )

  return (
    <>
      <button
        ref={gatilho}
        type="button"
        onClick={() => setAberto(true)}
        aria-label="Conta e ajustes"
        aria-expanded={aberto}
        className="inline-flex size-9 items-center justify-center rounded-lg text-synse-muted transition-colors hover:bg-synse-surface-2 hover:text-synse-text"
      >
        <Settings className="size-4" aria-hidden />
      </button>

      {/* `montado` porque portal não existe na renderização do servidor. */}
      {montado && aberto && createPortal(painel, document.body)}
    </>
  )
}
