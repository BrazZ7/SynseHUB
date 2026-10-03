'use client'

import { Check, Clock, Trophy, UserPlus, X } from 'lucide-react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  removeFriendshipAction,
  requestFriendshipAction,
  respondFriendshipAction,
} from '@/features/friends/actions'
import type { FriendActionState } from '@/features/friends/state'
import { cn, formatNumber } from '@/lib/utils'
import type { Friend, FriendRankRow } from '@/types/domain'

/**
 * Amigos e o ranking entre eles.
 *
 * ── Por que a lista mostra quem não autorizou ───────────────────────────────
 *
 * Amigo sem consentimento não sai no ranking — essa é a regra, e o banco a
 * aplica. Mas sumir com ele da lista faria parecer defeito: "adicionei e não
 * apareceu". Ele fica visível, com a etiqueta dizendo que ainda não autorizou,
 * e quem olha entende que falta a outra pessoa decidir, não o app funcionar.
 */

const INICIAL: FriendActionState = {}

function Enviando({ children, ...resto }: React.ComponentProps<typeof Button>) {
  const { pending } = useFormStatus()
  return (
    <Button {...resto} disabled={pending || resto.disabled}>
      {children}
    </Button>
  )
}

export function FriendsPanel({
  meuSynseId,
  amigos,
  ranking,
  dias,
}: {
  meuSynseId: string
  amigos: readonly Friend[]
  ranking: readonly FriendRankRow[]
  dias: number
}) {
  const [pedido, pedir] = useActionState(requestFriendshipAction, INICIAL)
  const [resposta, responder] = useActionState(respondFriendshipAction, INICIAL)
  const [remocao, remover] = useActionState(removeFriendshipAction, INICIAL)

  const recebidos = amigos.filter((a) => a.status === 'PENDING' && !a.souQuemPediu)
  const enviados = amigos.filter((a) => a.status === 'PENDING' && a.souQuemPediu)
  const aceitos = amigos.filter((a) => a.status === 'ACCEPTED')

  const aviso = pedido.error ?? resposta.error ?? remocao.error
  const feito = pedido.ok ?? resposta.ok ?? remocao.ok

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-synse-text">
          <UserPlus className="size-4 text-synse-primary" aria-hidden />
          Adicionar amigo
        </h2>

        {/*
          O próprio Synse ID vem primeiro: para adicionar alguém é preciso que
          essa pessoa passe o dela, e a primeira coisa que se faz é mandar o
          seu. Esconder atrás de um menu transformaria um passo em dois.
        */}
        <p className="mt-3 text-xs text-synse-muted">O seu Synse ID, para passar a quem quiser:</p>
        <p className="mt-1 select-all font-mono text-lg font-semibold tracking-wide text-synse-text">
          {meuSynseId}
        </p>

        <form action={pedir} className="mt-4 flex gap-2">
          <Input
            name="synseId"
            placeholder="SYN-XXXXXXXX"
            aria-label="Synse ID de quem você quer adicionar"
            autoComplete="off"
            spellCheck={false}
            className="font-mono uppercase"
            maxLength={12}
          />
          <Enviando type="submit" className="shrink-0">
            Pedir
          </Enviando>
        </form>

        {aviso && <p className="mt-2 text-sm text-synse-danger">{aviso}</p>}
        {!aviso && feito && <p className="mt-2 text-sm text-synse-success">{feito}</p>}
      </section>

      {recebidos.length > 0 && (
        <section className="rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm">
          <h2 className="text-sm font-semibold text-synse-text">
            Pedidos recebidos{' '}
            <Badge variant="primary" className="ml-1">
              {recebidos.length}
            </Badge>
          </h2>
          <ul className="mt-3 divide-y divide-synse-border">
            {recebidos.map((amigo) => (
              <li key={amigo.friendshipId} className="flex items-center gap-3 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-synse-text">
                    {amigo.name}
                  </span>
                  <span className="block font-mono text-xs text-synse-muted">{amigo.synseId}</span>
                </span>
                <form action={responder} className="flex shrink-0 gap-1">
                  <input type="hidden" name="friendshipId" value={amigo.friendshipId} />
                  <Enviando
                    type="submit"
                    name="accept"
                    value="true"
                    size="sm"
                    aria-label={`Aceitar ${amigo.name}`}
                  >
                    <Check className="size-4" aria-hidden />
                  </Enviando>
                  <Enviando
                    type="submit"
                    name="accept"
                    value="false"
                    size="sm"
                    variant="ghost"
                    aria-label={`Recusar ${amigo.name}`}
                  >
                    <X className="size-4" aria-hidden />
                  </Enviando>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-synse-text">
          <Trophy className="size-4 text-synse-primary" aria-hidden />
          Ranking dos últimos {dias} dias
          <Badge variant="primary">Synse+</Badge>
        </h2>
        <p className="mt-1 text-xs text-synse-muted">
          Por treinos concluídos. Só aparece quem autorizou — inclusive você.
        </p>

        {ranking.length <= 1 ? (
          <p className="mt-4 text-sm text-synse-muted">
            {aceitos.length === 0
              ? 'Adicione alguém pelo Synse ID e o ranking começa a valer.'
              : 'Nenhum dos seus amigos autorizou aparecer em ranking ainda.'}
          </p>
        ) : (
          <ol className="mt-3 divide-y divide-synse-border">
            {ranking.map((linha) => (
              <li
                key={linha.profileId}
                className={cn(
                  '-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5',
                  linha.souEu && 'bg-synse-surface-2',
                )}
              >
                <span
                  className="flex size-7 shrink-0 items-center justify-center rounded-full bg-synse-bg text-xs font-semibold tabular-nums text-synse-text"
                  aria-hidden
                >
                  {linha.position}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-synse-text">
                    {linha.name}
                    {linha.souEu && <span className="ml-1 text-xs text-synse-muted">(você)</span>}
                  </span>
                  {/*
                    O volume não é enfeite: empate em número de treinos é comum
                    — cinco e cinco é uma semana normal — e sem mostrar o que
                    desempatou, a ordem parece sorteio. É ele que ordena por
                    baixo, então é ele que precisa aparecer.
                  */}
                  <span className="block text-xs tabular-nums text-synse-muted">
                    {formatNumber(linha.volumeKg / 1000, { maximumFractionDigits: 1 })} t levantadas
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-synse-primary">
                  {formatNumber(linha.workouts)}
                  <span className="ml-1 text-xs font-normal text-synse-muted">
                    {linha.workouts === 1 ? 'treino' : 'treinos'}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {(aceitos.length > 0 || enviados.length > 0) && (
        <section className="rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm">
          <h2 className="text-sm font-semibold text-synse-text">Seus amigos</h2>
          <ul className="mt-3 divide-y divide-synse-border">
            {[...aceitos, ...enviados].map((amigo) => (
              <li key={amigo.friendshipId} className="flex items-center gap-3 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-synse-text">
                    {amigo.name}
                  </span>
                  <span className="block text-xs text-synse-muted">
                    {amigo.status === 'PENDING' ? (
                      <span className="flex items-center gap-1">
                        <Clock className="size-3" aria-hidden />
                        Aguardando resposta
                      </span>
                    ) : amigo.noRanking ? (
                      amigo.synseId
                    ) : (
                      /*
                        Dizer isto em vez de sumir com a pessoa: some, e quem
                        adicionou acha que o app não funcionou.
                      */
                      'Ainda não autorizou aparecer no ranking'
                    )}
                  </span>
                </span>
                <form action={remover} className="shrink-0">
                  <input type="hidden" name="friendshipId" value={amigo.friendshipId} />
                  <Enviando
                    type="submit"
                    size="sm"
                    variant="ghost"
                    aria-label={`Desfazer amizade com ${amigo.name}`}
                  >
                    Remover
                  </Enviando>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
