import Link from 'next/link'
import type { ReactNode } from 'react'

import { SynseLogo } from '@/components/synse/synse-logo'

/**
 * ── A área pública ──────────────────────────────────────────────────────────
 *
 * Tudo fora de `/login`, `/termos` e `/privacidade` exigia sessão. Esta é a
 * primeira parte do produto feita para quem **não tem conta**: a corrida é
 * anunciada por link, e quem recebe o link precisa ver a prova e se
 * inscrever sem baixar nada.
 *
 * Não há proteção a remover aqui — o middleware do projeto só renova sessão,
 * nunca autorizou ninguém; quem protege é cada página, chamando
 * `requireHubSession` ou `requireStudentSession`. Esta não chama, e é por
 * isso que ela é pública. O recorte do que se enxerga é da RLS: a política do
 * anônimo em `events` só alcança o que está publicado.
 *
 * O `<main>` existe de propósito. O app do aluno não tem nenhum — é `<div>`
 * aninhada do topo ao rodapé, e quem usa leitor de tela não tem o marco de
 * conteúdo principal. Aqui, que é código novo, sai certo.
 */
export default function EventosLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-svh bg-synse-bg">
      <header className="border-b border-synse-border bg-synse-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-4">
          <Link href="/" aria-label="Synse">
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

      <main className="mx-auto max-w-3xl px-5 py-8">{children}</main>

      <footer className="mx-auto max-w-3xl px-5 pb-10 text-xs text-synse-muted">
        Inscrição feita pelo Synse. Dúvidas sobre o evento são com a organização.
      </footer>
    </div>
  )
}
