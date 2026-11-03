import { Flame, Users } from 'lucide-react'

import { CartaoDoTreino } from '@/features/squad/cartao-do-treino'
import { CodigoDoEsquadrao } from '@/features/squad/codigo-do-esquadrao'
import { MarcarTreino } from '@/features/squad/marcar-treino'
import { PainelDePresenca } from '@/features/squad/painel-de-presenca'
import { QuemEDoEsquadrao } from '@/features/squad/quem-e-do-esquadrao'
import {
  contarNaAcademia,
  foraDoRanking,
  iniciais,
  ordenarLobby,
  rankingDaSemana,
  rotuloDaPresenca,
} from '@/features/squad/state'
import { cn } from '@/lib/utils'
import type { PresenceState, Squad, SquadMember, SquadSession } from '@/types/domain'

/**
 * ── O lobby ─────────────────────────────────────────────────────────────────
 *
 * A ordem da tela é a ordem das perguntas de quem abre: **quem está lá
 * agora**, depois **o que está marcado**, depois **como foi a semana**. O
 * botão de presença fica entre as duas primeiras porque é o que a pessoa vem
 * fazer, e não o que ela vem ler.
 */

/** O anel colorido do avatar diz o estado sem precisar de legenda. */
const ANEL: Record<PresenceState, string> = {
  TREINANDO: 'ring-synse-primary',
  CHEGUEI: 'ring-synse-primary/60',
  A_CAMINHO: 'ring-amber-400/70',
  TERMINEI: 'ring-synse-border',
}

function Avatar({ membro }: { membro: SquadMember }) {
  const estado = rotuloDaPresenca(membro.presenca)

  return (
    <div className="flex w-16 shrink-0 flex-col items-center gap-1.5">
      <div
        className={cn(
          'flex size-14 items-center justify-center rounded-full bg-synse-surface-2 text-sm font-semibold text-synse-text ring-2',
          membro.presenca ? ANEL[membro.presenca] : 'ring-transparent',
          // Sem presença, o avatar recua: a tela é sobre quem está lá.
          !membro.presenca && 'opacity-50',
        )}
      >
        {iniciais(membro.nome)}
      </div>
      <p className="w-full truncate text-center text-[11px] font-medium text-synse-text">
        {membro.souEu ? 'Você' : membro.nome.split(' ')[0]}
      </p>
      <p className="h-3 w-full truncate text-center text-[10px] text-synse-muted">{estado ?? ''}</p>
    </div>
  )
}

export function Lobby({
  esquadrao,
  membros,
  sessoes,
  fichas,
  meuPerfilId,
}: {
  esquadrao: Squad
  membros: readonly SquadMember[]
  sessoes: readonly SquadSession[]
  fichas: ReadonlyArray<{ id: string; nome: string }>
  meuPerfilId: string
}) {
  const ordenados = ordenarLobby(membros)
  const naAcademia = contarNaAcademia(membros)
  const eu = membros.find((m) => m.souEu) ?? null
  const ranking = rankingDaSemana(membros)
  const escondidos = foraDoRanking(membros)
  const maximo = Math.max(1, ...ranking.map((m) => m.diasNaSemana ?? 0))
  const souDono = eu?.papel === 'OWNER'

  return (
    <div className="space-y-4">
      {/* ── Quem está lá ─────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-synse-border bg-synse-surface p-4 shadow-synse-sm">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-synse-text">
            {naAcademia > 0 ? (
              <span className="flex items-center gap-1.5">
                <Flame className="size-4 text-synse-primary" aria-hidden />
                {naAcademia} na academia agora
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-synse-muted">
                <Users className="size-4" aria-hidden />
                Ninguém avisou que chegou
              </span>
            )}
          </p>
          <p className="text-xs text-synse-muted">
            {esquadrao.membros} de 8
          </p>
        </div>

        {/*
          Em linha e com rolagem lateral: oito avatares não cabem na largura de
          um celular, e quebrar em duas linhas faria o cartão crescer e
          empurrar o treino marcado para fora da tela.
        */}
        <div className="-mx-4 mt-3 flex gap-1 overflow-x-auto px-4 pb-1">
          {ordenados.map((membro) => (
            <Avatar key={membro.profileId} membro={membro} />
          ))}
        </div>
      </section>

      <PainelDePresenca inicial={eu?.presenca ?? null} />

      {/* ── O que está marcado ───────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-synse-text">Treinos marcados</h2>

        {sessoes.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-synse-border p-4 text-sm text-synse-muted">
            Nada marcado. Combine o próximo e todo mundo recebe o aviso.
          </p>
        ) : (
          sessoes.map((sessao) => (
            <CartaoDoTreino
              key={sessao.id}
              sessao={sessao}
              /* Quem marcou, ou o dono do esquadrão — a mesma regra do banco. */
              podeCancelar={sessao.criadoPor === meuPerfilId || souDono}
            />
          ))
        )}

        <MarcarTreino squadId={esquadrao.id} fichas={fichas} />
      </section>

      {/* ── A semana ─────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-synse-border bg-synse-surface p-4 shadow-synse-sm">
        <h2 className="text-sm font-semibold text-synse-text">A semana do esquadrão</h2>
        <p className="mt-0.5 text-xs text-synse-muted">
          Dias treinados de segunda até hoje.
        </p>

        <ol className="mt-3 space-y-2">
          {ranking.map((membro, posicao) => (
            <li key={membro.profileId} className="flex items-center gap-3">
              <span className="w-4 shrink-0 text-xs tabular-nums text-synse-muted">
                {posicao + 1}
              </span>
              <span
                className={cn(
                  'w-24 shrink-0 truncate text-sm',
                  membro.souEu ? 'font-semibold text-synse-text' : 'text-synse-text',
                )}
              >
                {membro.souEu ? 'Você' : membro.nome.split(' ')[0]}
              </span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-synse-surface-2">
                <span
                  className="block h-full rounded-full bg-synse-primary"
                  style={{ width: `${Math.round(((membro.diasNaSemana ?? 0) / maximo) * 100)}%` }}
                />
              </span>
              <span className="w-12 shrink-0 text-right text-xs tabular-nums text-synse-muted">
                {membro.diasNaSemana} {membro.diasNaSemana === 1 ? 'dia' : 'dias'}
              </span>
            </li>
          ))}
        </ol>

        {/*
          Quem não autorizou não vira uma linha com traço no lugar do número.

          Uma linha assim é cobrança pública por uma escolha privada: o grupo
          lê "fulano escondeu". A frase conta quantos são, sem nome.
        */}
        {escondidos > 0 && (
          <p className="mt-3 text-xs text-synse-muted">
            {escondidos === 1
              ? '1 pessoa do esquadrão preferiu não aparecer no ranking.'
              : `${escondidos} pessoas do esquadrão preferiram não aparecer no ranking.`}{' '}
            É escolha de cada um, em Perfil → Privacidade.
          </p>
        )}
      </section>

      <QuemEDoEsquadrao esquadrao={esquadrao} membros={membros} souDono={souDono} />

      <CodigoDoEsquadrao esquadrao={esquadrao} souDono={souDono} />
    </div>
  )
}
