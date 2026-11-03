'use client'

import { useState, useTransition } from 'react'
import { Plus, Users } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { criarEsquadraoAction, entrarNoEsquadraoAction } from '@/features/squad/actions'

/**
 * A tela de quem ainda não tem esquadrão.
 *
 * ── Duas portas, e a de entrar vem primeiro ─────────────────────────────────
 *
 * Quem chega aqui normalmente chegou porque **alguém mandou um código**. Criar
 * um esquadrão vazio e ficar sozinho nele é o caminho que decepciona, então
 * ele é o segundo — presente, sem ser o convite da tela.
 */
export function SemEsquadrao() {
  const [codigo, setCodigo] = useState('')
  const [nome, setNome] = useState('')
  const [criando, setCriando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, iniciar] = useTransition()

  const entrar = () => {
    setErro(null)
    iniciar(async () => {
      const r = await entrarNoEsquadraoAction(codigo)
      if (!r.ok) setErro(r.erro ?? 'Não deu para entrar.')
    })
  }

  const criar = () => {
    setErro(null)
    if (nome.trim().length < 2) {
      setErro('O nome precisa de pelo menos duas letras.')
      return
    }
    iniciar(async () => {
      const r = await criarEsquadraoAction(nome)
      if (!r.ok) setErro(r.erro ?? 'Não deu para criar.')
    })
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm">
        <div className="flex items-center gap-2 text-synse-primary">
          <Users className="size-5" aria-hidden />
          <h2 className="text-sm font-semibold text-synse-text">Entrar com um código</h2>
        </div>
        <p className="mt-1 text-sm text-synse-muted">
          Quem já está num esquadrão tem um código de seis letras para passar.
        </p>

        <div className="mt-3 flex gap-2">
          <Input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            placeholder="ABC123"
            maxLength={6}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Código do esquadrão"
            className="text-center text-lg tracking-[0.3em]"
          />
          <Button onClick={entrar} disabled={ocupado || codigo.trim().length < 6}>
            Entrar
          </Button>
        </div>
      </section>

      <section className="rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm">
        <h2 className="text-sm font-semibold text-synse-text">Ou comece o seu</h2>
        <p className="mt-1 text-sm text-synse-muted">
          Você cria, recebe um código e chama até sete pessoas.
        </p>

        {criando ? (
          <div className="mt-3 flex gap-2">
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Quinta de Perna"
              maxLength={40}
              aria-label="Nome do esquadrão"
            />
            <Button onClick={criar} disabled={ocupado}>
              Criar
            </Button>
          </div>
        ) : (
          <Button variant="outline" className="mt-3 w-full" onClick={() => setCriando(true)}>
            <Plus className="size-4" aria-hidden />
            Criar um esquadrão
          </Button>
        )}
      </section>

      {erro && (
        <p className="rounded-xl border border-synse-danger/40 bg-synse-danger/5 p-3 text-sm text-synse-danger">
          {erro}
        </p>
      )}
    </div>
  )
}
