import { SynseLogo } from '@/components/synse/synse-logo'

/**
 * Casca das telas de acesso.
 * É uma das poucas áreas onde os elementos naturais da marca aparecem — a
 * interface de trabalho permanece sóbria.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      {/* Painel institucional */}
      <aside className="relative hidden overflow-hidden bg-synse-gradient-deep p-10 lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-synse-primary/20 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-20 size-96 rounded-full bg-synse-cyan/15 blur-3xl"
        />

        <SynseLogo tone="light" size="lg" showTagline />

        <div className="relative max-w-md space-y-4">
          <p className="text-3xl font-semibold leading-tight text-white">
            Pequenas escolhas hoje.
            <br />
            <span className="text-synse-primary-light">Grandes conquistas amanhã.</span>
          </p>
          <p className="text-sm leading-relaxed text-white/60">
            Gestão, pagamentos, treinos, relacionamento e bem-estar em um único ecossistema. O
            SynseHub cuida da operação para que a academia cuide das pessoas.
          </p>
        </div>

        <p className="relative text-xs uppercase tracking-[0.2em] text-white/40">
          Saúde é a base de tudo
        </p>
      </aside>

      {/* Formulário */}
      <main className="flex min-w-0 items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <SynseLogo size="md" showTagline />
          </div>
          {children}
        </div>
      </main>
    </div>
  )
}
