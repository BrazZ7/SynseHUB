'use client'

import { useState, useTransition } from 'react'
import { MessageSquare } from 'lucide-react'

import { mandarRecadoAction } from '@/features/squad/actions'
import { RECADOS, fraseDoRecado, haQuantoTempo } from '@/features/squad/state'
import { cn } from '@/lib/utils'
import type { SquadPing, SquadPingKind } from '@/types/domain'

/**
 * ── O painel de recados ─────────────────────────────────────────────────────
 *
 * No lugar onde a referência tem um chat, com a mesma cara: bolhas com nome e
 * frase, as minhas de um lado e as dos outros do outro.
 *
 * **Não é chat, e a diferença é de natureza, não de tamanho.** São seis frases
 * prontas. Com elas não há como ofender ninguém, não há o que moderar, e não
 * há texto livre de menor de idade numa tabela que ninguém auditou — e este
 * produto não tem denúncia, não tem bloqueio e não tem quem leia.
 *
 * Se um dia houver chat de verdade, ele precisa vir com as três coisas. Trocar
 * estes botões por um campo de texto sem elas é a mudança que não pode
 * acontecer em silêncio.
 *
 * ── O recado aparece na hora, antes do servidor ─────────────────────────────
 *
 * E some se a gravação falhar. O limite de um a cada vinte segundos devolve
 * `false` sem erro: nesse caso o recado otimista some e a tela não reclama —
 * dizer "espere 14 segundos" para quem tocou duas vezes é transformar engano
 * de dedo em mensagem de erro.
 */
export function Recados({
  squadId,
  iniciais: recadosIniciais,
  meuNome,
}: {
  squadId: string
  iniciais: readonly SquadPing[]
  meuNome: string
}) {
  const [recados, setRecados] = useState<SquadPing[]>([...recadosIniciais])
  const [enviando, iniciar] = useTransition()

  const mandar = (kind: SquadPingKind) => {
    const provisorio: SquadPing = {
      id: `otimista-${Date.now()}`,
      profileId: 'eu',
      nome: meuNome,
      kind,
      criadoEm: new Date().toISOString(),
      souEu: true,
    }
    setRecados((atual) => [...atual, provisorio])

    iniciar(async () => {
      const resposta = await mandarRecadoAction(squadId, kind)
      if (!resposta.ok || resposta.mandou === false) {
        setRecados((atual) => atual.filter((r) => r.id !== provisorio.id))
      }
    })
  }

  return (
    <section className="rounded-2xl border border-synse-border bg-synse-surface p-4 shadow-synse-sm">
      <div className="flex items-center gap-2">
        <MessageSquare className="size-4 text-synse-primary" aria-hidden />
        <h2 className="text-sm font-semibold text-synse-text">Recados</h2>
      </div>

      {recados.length === 0 ? (
        <p className="mt-3 text-sm text-synse-muted">
          Nada ainda. Toque num recado abaixo para avisar o esquadrão.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {recados.map((recado) => (
            <li
              key={recado.id}
              className={cn('flex', recado.souEu ? 'justify-end' : 'justify-start')}
            >
              <div
                className={cn(
                  'max-w-[85%] rounded-2xl px-3 py-2',
                  recado.souEu
                    ? 'bg-synse-primary/10 text-synse-text'
                    : 'bg-synse-surface-2 text-synse-text',
                )}
              >
                <p className="text-sm">
                  {!recado.souEu && (
                    <span className="font-semibold text-synse-primary">
                      {recado.nome.split(' ')[0]}:{' '}
                    </span>
                  )}
                  {fraseDoRecado(recado.kind)}
                </p>
                <p className="mt-0.5 text-[10px] text-synse-muted">
                  {haQuantoTempo(recado.criadoEm)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/*
        Os seis botões no lugar do campo de texto. Rolagem lateral porque seis
        não cabem lado a lado num celular, e quebrar em duas linhas faria o
        painel crescer mais que a conversa que ele carrega.
      */}
      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
        {RECADOS.map(({ valor, botao }) => (
          <button
            key={valor}
            type="button"
            onClick={() => mandar(valor)}
            disabled={enviando}
            className="shrink-0 rounded-full border border-synse-border px-3 py-1.5 text-xs font-medium text-synse-muted transition-colors hover:border-synse-primary hover:text-synse-primary disabled:opacity-60"
          >
            {botao}
          </button>
        ))}
      </div>
    </section>
  )
}
