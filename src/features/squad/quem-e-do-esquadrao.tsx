'use client'

import { useState, useTransition } from 'react'
import { Check, Crown, Pencil, UserMinus, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { removerDoEsquadraoAction, renomearEsquadraoAction } from '@/features/squad/actions'
import type { Squad, SquadMember } from '@/types/domain'

/**
 * A lista de membros, e o que só o dono pode fazer.
 *
 * ── Tirar alguém não é enfeite ──────────────────────────────────────────────
 *
 * O esquadrão entra por código, e código circula. Quem fica com o do grupo
 * errado, ou alguém que repassou para quem não devia, precisa de uma saída —
 * e sem ela a única alternativa seria o grupo inteiro abandonar e refazer.
 * É a mesma razão de o dono poder renomear: o nome aparece para todo mundo.
 *
 * Só o dono vê os dois controles, e o banco confere de novo (0068). A tela
 * esconde; quem decide é a função.
 */
export function QuemEDoEsquadrao({
  esquadrao,
  membros,
  souDono,
}: {
  esquadrao: Squad
  membros: readonly SquadMember[]
  souDono: boolean
}) {
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState(esquadrao.nome)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, iniciar] = useTransition()

  const salvarNome = () => {
    setErro(null)
    if (nome.trim().length < 2) {
      setErro('O nome precisa de pelo menos duas letras.')
      return
    }
    iniciar(async () => {
      const r = await renomearEsquadraoAction(esquadrao.id, nome)
      if (!r.ok) {
        setErro(r.erro ?? 'Não deu para renomear.')
        setNome(esquadrao.nome)
      }
      setEditando(false)
    })
  }

  const remover = (membro: SquadMember) => {
    setErro(null)
    iniciar(async () => {
      const r = await removerDoEsquadraoAction(esquadrao.id, membro.profileId)
      if (!r.ok) setErro(r.erro ?? 'Não deu para remover.')
    })
  }

  return (
    <section className="rounded-2xl border border-synse-border bg-synse-surface p-4 shadow-synse-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-synse-text">Quem é do esquadrão</h2>
        {souDono && !editando && (
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="inline-flex items-center gap-1 text-xs text-synse-muted hover:text-synse-text"
          >
            <Pencil className="size-3.5" aria-hidden />
            Renomear
          </button>
        )}
      </div>

      {editando && (
        <div className="mt-3 flex gap-2">
          <Input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            maxLength={40}
            aria-label="Nome do esquadrão"
          />
          <Button size="icon" onClick={salvarNome} disabled={ocupado} aria-label="Salvar o nome">
            <Check className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => {
              setNome(esquadrao.nome)
              setEditando(false)
            }}
            aria-label="Desistir"
          >
            <X className="size-4" />
          </Button>
        </div>
      )}

      <ul className="mt-2 divide-y divide-synse-border">
        {membros.map((membro) => (
          <li key={membro.profileId} className="flex items-center gap-2 py-2">
            <span className="min-w-0 flex-1 truncate text-sm text-synse-text">
              {membro.nome}
              {membro.souEu && <span className="text-synse-muted"> · você</span>}
            </span>

            {membro.papel === 'OWNER' && (
              <Badge variant="outline">
                <Crown className="size-3" aria-hidden />
                Dono
              </Badge>
            )}

            {/* O dono não se remove por aqui: sair tem a regra da sucessão. */}
            {souDono && !membro.souEu && (
              <button
                type="button"
                onClick={() => remover(membro)}
                disabled={ocupado}
                aria-label={`Tirar ${membro.nome} do esquadrão`}
                className="rounded-lg p-1.5 text-synse-muted transition-colors hover:text-synse-danger disabled:opacity-60"
              >
                <UserMinus className="size-4" aria-hidden />
              </button>
            )}
          </li>
        ))}
      </ul>

      {erro && <p className="mt-2 text-xs text-synse-danger">{erro}</p>}
    </section>
  )
}
