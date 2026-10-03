import Link from 'next/link'
import type { ReactNode } from 'react'

import { SynseLogo } from '@/components/synse/synse-logo'
import { LEGAL } from '@/config/app'
import { formatDate } from '@/lib/utils'

/**
 * Moldura dos documentos legais.
 *
 * Página aberta, sem sessão: quem precisa ler os termos com frequência é
 * justamente quem ainda não criou a conta, e quem quer apagar a dele.
 */
export function LegalDocument({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-synse-bg">
      <header className="border-b border-synse-border bg-synse-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-5 py-4">
          <Link href="/" aria-label="Início">
            <SynseLogo />
          </Link>
          <div className="flex gap-4 text-sm">
            <Link href="/termos" className="text-synse-muted hover:text-synse-text">
              Termos
            </Link>
            <Link href="/privacidade" className="text-synse-muted hover:text-synse-text">
              Privacidade
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-8">
        <h1 className="text-2xl font-semibold text-synse-text">{title}</h1>
        <p className="mt-1 text-sm text-synse-muted">
          Versão {LEGAL.version} · em vigor desde {formatDate(LEGAL.updatedAt)}
        </p>

        <div className="mt-6 space-y-6 text-sm leading-relaxed text-synse-text">{children}</div>

        <ControladorBlock />
      </main>
    </div>
  )
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-synse-text">{title}</h2>
      <div className="space-y-2 text-synse-muted">{children}</div>
    </section>
  )
}

/**
 * Quem responde pelo documento.
 *
 * Enquanto a empresa não estiver constituída, isto diz a verdade em vez de
 * exibir um CNPJ inventado — e o contato, que é o que precisa funcionar de
 * fato, aparece dos dois jeitos.
 */
function ControladorBlock() {
  const identificado = LEGAL.entity && LEGAL.taxId

  return (
    <section className="mt-10 rounded-2xl border border-synse-border bg-synse-surface p-5 text-sm">
      <h2 className="mb-2 text-base font-semibold text-synse-text">Quem responde por isto</h2>
      {identificado ? (
        <p className="text-synse-muted">
          {LEGAL.entity}, inscrita no CNPJ sob o nº {LEGAL.taxId}
          {LEGAL.address ? `, com sede em ${LEGAL.address}` : ''}.
        </p>
      ) : (
        <p className="text-synse-muted">
          O Synse está em constituição, e a identificação registral do controlador será publicada
          aqui assim que existir. Até lá, o canal abaixo é o endereço oficial para exercer direitos
          e tirar dúvidas — e ele funciona.
        </p>
      )}
      <p className="mt-2 text-synse-muted">
        Contato para privacidade e direitos do titular:{' '}
        <a className="text-synse-primary hover:underline" href={`mailto:${LEGAL.contactEmail}`}>
          {LEGAL.contactEmail}
        </a>
      </p>
    </section>
  )
}
